#!/usr/local/bin/python

import codecs, requests, json, hashlib, lxml
from lxml import etree
from datetime import datetime

startTime = datetime.now()

payload = {
    'authenticity_token': 'm1UMtiHYMjbDPu/0l6owy1bbjNjsY+9duAswA171xsc=',
    'commit': 'Export',
    'format': 'osm',
    
    'maxlon': -71.23830061769104,
    'minlon': -71.24994140481567,
    
    'minlat': 46.80356166920837,
    'maxlat': 46.80981097146872,
}

hash = hashlib.md5(json.dumps(payload).encode()).hexdigest()
xml_file = 'data/' + hash + '.xml'
json_file = 'data/' + hash + '.json'
url = "http://www.openstreetmap.org/export/finish"

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

xml = etree.parse(xml_file)

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

ways_filter = '/osm/way[not(tag[' + ' or '.join(filters) + '])]';

refs = list(map(int, xml.xpath(ways_filter + '/nd/@ref')));

print("Found %d node references" % len(refs))

repeated_refs = set([x for x in refs if refs.count(x) >= 2])

print("Found %d node references mentioned in 2 or more ways" % len(repeated_refs))

nodes = xml.xpath('/osm/node')

intersections = []

for node in nodes:
    node_id = int(node.get('id'))
    if  node_id in repeated_refs:
        #ways = list(map(int, xml.xpath('%s/nd[@ref="%d"]/parent::way/@id' % (ways_filter, node_id))));
        
        followingNodes = list(map(int, xml.xpath('%s/nd[@ref="%d"]/following-sibling::nd[1]/@ref' % (ways_filter, node_id))));
        precedingNodes = list(map(int, xml.xpath('%s/nd[@ref="%d"]/preceding-sibling::nd[1]/@ref' % (ways_filter, node_id))));
        
        adjacentNodes = followingNodes + precedingNodes
        
        intersection = {
			'id': node_id,
			'lat': float(node.get('lat')),
			'lng': float(node.get('lon')),
			#'ways': ways,
			'adjacentNodes': adjacentNodes,
        }
        
        intersections.append(intersection)

with codecs.open(json_file, "wb", "utf-8") as f:
    f.write(json.dumps(intersections, sort_keys=False, indent="\t", separators=(',', ': ')))
    f.close()

print("Chekov finished in %s." % (datetime.now()-startTime))

### Done!