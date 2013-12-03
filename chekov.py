#!/usr/local/bin/python

# Imports
import sys, argparse, codecs, requests, json, hashlib, lxml
from lxml import etree
from datetime import datetime

# Measuring execution time
start_time = datetime.now()

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

# Parse arguments
parser = argparse.ArgumentParser(description='Chekov reporting.')
parser.add_argument('-maxlon','--maxlon', help='Maximum longitude.',required=False)
parser.add_argument('-minlon','--minlon', help='Minimum longitude.',required=False)
parser.add_argument('-maxlat','--maxlat', help='Maximum latitude.',required=False)
parser.add_argument('-minlat','--minlat', help='Minimum latitude.',required=False)
args = parser.parse_args()

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

# Prepare file download
hash = hashlib.md5(json.dumps(payload).encode()).hexdigest()
xml_file = 'data/' + hash + '.xml'
json_file = 'data/' + hash + '.json'
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
            f.write(data)
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

# Base XPath query
ways_filter = '/osm/way[not(tag[' + ' or '.join(filters) + '])]';

# Node references, convert to integers
refs = list(map(int, xml.xpath(ways_filter + '/nd/@ref')));

print("Found %d node references." % len(refs))

# Repeated node references, 2 or more times
repeated_refs = set([x for x in refs if refs.count(x) >= 2])

print("Found %d intersections." % len(repeated_refs))

# All nodes
nodes = xml.xpath('/osm/node')

intersections = []

print("Finding closest nodes to %d intersections." % len(repeated_refs))

total = len(repeated_refs)
progress = 0
done = 0

# Find adjacent nodes
for node in nodes:
    node_id = int(node.get('id'))
    
    # Repeated node
    if  node_id in repeated_refs:
        # Get all ways where node is featured
        #ways = list(map(int, xml.xpath('%s/nd[@ref="%d"]/parent::way/@id' % (ways_filter, node_id))));
        
        # Find adjacent nodes
        adjacentNodes = list(map(int, xml.xpath('%s/nd[@ref="%d"]/following-sibling::nd[1]/@ref | %s/nd[@ref="%d"]/preceding-sibling::nd[1]/@ref' % (ways_filter, node_id, ways_filter, node_id))));
        
        # Intersection dictionary
        intersection = {
			'id': node_id,
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

print("Chekov finished in %s." % (datetime.now()-start_time))