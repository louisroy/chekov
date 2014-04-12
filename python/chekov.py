#!/usr/local/bin/python

# Imports
import os, sys, argparse, codecs, requests, json, hashlib, lxml
from lxml import etree
from datetime import datetime

# Output errors
sys.stderr = sys.stdout

# Measuring execution time
start_time = datetime.now()

# Parse arguments
parser = argparse.ArgumentParser(description='Chekov reporting.')

parser.add_argument('-maxlon','--maxlon', help='Maximum longitude.',required=False)
parser.add_argument('-minlon','--minlon', help='Minimum longitude.',required=False)
parser.add_argument('-maxlat','--maxlat', help='Maximum latitude.',required=False)
parser.add_argument('-minlat','--minlat', help='Minimum latitude.',required=False)
parser.add_argument('-filename','--filename', help='Filename.',required=False)
parser.add_argument('-output','--output', help='Output format.',required=False)

args = parser.parse_args()

# Default payload (zoomed in Quebec City)
payload = {
    'authenticity_token': 'm1UMtiHYMjbDPu/0l6owy1bbjNjsY+9duAswA171xsc=',
    'commit': 'Export',
    'format': 'osm',
    
    'maxlon': -71.23830061769104,
    'minlon': -71.24994140481567,
    
    'minlat': 46.80356166920837,
    'maxlat': 46.80981097146872,
}

# Merge to defaults
if (args.maxlon):
    payload['maxlon'] = float(args.maxlon)
if (args.minlon):
    payload['minlon'] = float(args.minlon)
if (args.maxlat):
    payload['maxlat'] = float(args.maxlat)
if (args.minlat):
    payload['minlat'] = float(args.minlat)

# Validations
if (payload['maxlon'] <= payload['minlon']):
    sys.exit("Longitude values invalid.")
if (payload['maxlat'] <= payload['minlat']):
    sys.exit("Latitude values invalid.")

# Default filename
filename = hashlib.md5(json.dumps(payload).encode()).hexdigest()

if (args.filename):
    filename = args.filename

# Prepare file download

xml_file = os.path.dirname(os.path.abspath(__file__)) + '/data/' + filename + '.xml'
json_file = os.path.dirname(os.path.abspath(__file__)) + '/data/' + filename + '.json'
url = "http://www.openstreetmap.org/export/finish"

# Download XML file from Open Street Maps
with codecs.open(xml_file, "wb", "utf-8") as f:
    print("Downloading %s" % xml_file)
    response = requests.post(url, data=payload)
    total_length = response.headers.get('content-length')
    
    if total_length is None: # no content length header
        f.write(response.text)
        f.close()
    else:
        dl = 0
        total_length = int(total_length)
        for data in response.iter_content():
            dl += len(data)
            f.write(data.decode('latin-1'))
            done = int(50 * dl / total_length)
            sys.stdout.write("\r[%s%s]" % ('=' * done, ' ' * (50-done)) )    
            sys.stdout.flush()

# Parse XML file
xml = etree.parse(xml_file)

# XPath filters to remove unnecessary information
filters = [
	'@k="building"',
	'@k="building:part"',
	'@k="amenity"',
	'@k="historic"',
	'@k="natural"',
	'@k="waterway"',
	'@k="leisure"',
	'@k="bridge"',
	'@k="railway"',
	'@k="service"',
	'@k="tourism"',
	'@k="shop"',
	'@k="internet_access"',
	
	# landuse : Mainly used for describe the primary use of land by humans (http://wiki.openstreetmap.org/wiki/Key:landuse)
	'contains(@k, "landuse")',
	
	# addr : To provide address information for buildings and facilities (http://wiki.openstreetmap.org/wiki/Key:addr)
	'contains(@k, "addr")',
	
	'@v="pier"',
	'@v="footway"',
	'@v="industrial"',
	'@v="recreation_ground"',
	'@v="dyke"',
	'@v="cycleway"',
	'@v="pedestrian"',
	'@v="track"',
	'@v="grass"',
	'@v="cemetery"',
]

print("XML has %d elements." % int(xml.xpath('count(//*)')))

# Clean up to speed up, mothertrucker!
deleted = 0
for bad in xml.xpath('/osm/way[tag[%s]] | //tag | /osm/relation | /osm/bounds' % (' or '.join(filters))):
    bad.getparent().remove(bad)
    deleted += 1

print("After clean up, XML has %d elements." % int(xml.xpath('count(//*)')))

# Node references, convert to integers
refs = list(map(int, xml.xpath('/osm/way/nd/@ref')));

print("Found %d node references." % len(refs))

# Repeated node references, 2 or more times
repeated_refs = set([x for x in refs if refs.count(x) >= 2])

print("Found %d intersections." % len(repeated_refs))

intersections = []

print("Finding closest nodes to %d intersections." % len(repeated_refs))

total = len(repeated_refs)
progress = 0
done = 0

# Find adjacent nodes
for node_id in repeated_refs:
    node = xml.xpath('/osm/node[@id="%d"]' % node_id)[0]
    
    # Get all ways where node is featured
    #ways = list(map(int, xml.xpath('/osm/way/nd[@ref="%d"]/parent::way/@id' % (node_id))));
    
    # Find adjacent nodes
    adjacentNodes = list(map(int, xml.xpath('/osm/way/nd[@ref="%d"]/following-sibling::nd/@ref | /osm/way/nd[@ref="%d"]/preceding-sibling::nd/@ref' % (node_id, node_id))));
    
    # Exclude current node as adjacent node
    adjacentNodes = [item for item in adjacentNodes if item != node_id]
    
    # Intersect lists
    adjacentNodes = list(set.intersection(repeated_refs, adjacentNodes))
    
    # You ain't got none adjacent node, gtfo
    if not adjacentNodes:
        continue
    
    # Intersection dictionary
    intersection = {
        'id': node_id,
        'content': "Node #%d" % node_id,
        'lat': float(node.get('lat')),
        'lng': float(node.get('lon')),
        #'ways': ways,
        'adjacentNodes': adjacentNodes,
    }
    
    # Append to list
    intersections.append(intersection)
    
    progress += 1
    
    done = int(50 * progress / total)
    
    sys.stdout.write("\r[%s%s]" % ('=' * done, ' ' * (50-done)) )    
    sys.stdout.flush()

print("")

# Write JSON file
with codecs.open(json_file, "wb", "utf-8") as f:
    f.write(json.dumps(intersections, sort_keys=False, indent="\t", separators=(',', ': ')))
    f.close()
    print("Saved %s" % json_file)

print("Chekov finished in %s." % (datetime.now() - start_time))