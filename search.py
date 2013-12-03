#!/usr/local/bin/python

import codecs, requests, json, hashlib, lxml
from lxml import etree

payload = {
    'authenticity_token': 'm1UMtiHYMjbDPu/0l6owy1bbjNjsY+9duAswA171xsc=',
    'commit': 'Export',
    'format': 'osm',
    
    'maxlon': '-71.24047052478409',
    'minlon': '-71.2462909183464',
    
    'minlat': '46.80266386902686',
    'maxlat': '46.805788663057434',
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
    else:
        dl = 0
        total_length = int(total_length)
        for data in response.iter_content():
            dl += len(data)
            f.write(data)
            done = int(50 * dl / total_length)
            sys.stdout.write("\r[%s%s]" % ('=' * done, ' ' * (50-done)) )    
            sys.stdout.flush()

#file = codecs.open(xml_file, "w", "utf-8")
#file.write(r.text)
#file.close()

tree = etree.parse(xml_file)

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

nodeIds = tree.xpath(ways_filter + '/nd/@ref');

print("Found %d nodes" % len(nodeIds))

nodeIds = set([x for x in nodeIds if nodeIds.count(x) >= 2])

print("Found %d intersections" % len(nodeIds))

print("Chekov finished.")

### Done!