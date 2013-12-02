<?php

set_time_limit(60);

$filterOccurences = function($var) {
	if ($var >= 2) {
		return $var;
	}
	
	return false;
};

$collapseXpathAttributes = function($value) {
	if (!empty($value[0])) {
		return (int)$value[0];
	}

	return $value;
};

include_once('uagent.php');

if (empty($_POST)) {
	$_POST['authenticity_token'] = 'lkmiXfMm+6KIyOcBXojI9BWLyEk+V57aU9Dv3QsRbHE=';
	$_POST['commit'] = 'Export';
	$_POST['format'] = 'osm';

	$_POST['maxlon'] = '-71.22261';
	$_POST['minlon'] = '-71.23308';

	$_POST['minlat'] = '44.80521';
	$_POST['maxlat'] = '46.81091';
}

$hash = md5(json_encode($_POST));
$xml_file = sprintf('data/%s.xml', $hash);
$json_file = sprintf('data/%s.json', $hash);

$ch = curl_init('http://www.openstreetmap.org/export/finish');

$user_agents = array(
	'Mozilla/5.0 (Windows NT 6.2; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1667.0 Safari/537.36',
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.6; rv:25.0) Gecko/20100101 Firefox/25.0',
	'Mozilla/5.0 (compatible; MSIE 10.6; Windows NT 6.1; Trident/5.0; InfoPath.2; SLCC1; .NET CLR 3.0.4506.2152; .NET CLR 3.5.30729; .NET CLR 2.0.50727) 3gpp-gba UNTRUSTED/1.0',
	'Mozilla/5.0 (compatible; MSIE 10.6; Windows NT 6.1; Trident/5.0; InfoPath.2; SLCC1; .NET CLR 3.0.4506.2152; .NET CLR 3.5.30729; .NET CLR 2.0.50727) 3gpp-gba UNTRUSTED/1.0',
	'Mozilla/5.0 (iPad; CPU OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5355d Safari/8536.25',
	'Opera/9.80 (Windows NT 6.0) Presto/2.12.388 Version/12.14',
);

curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $_POST);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_VERBOSE, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_USERAGENT, $user_agents[array_rand($user_agents)]);

$response = curl_exec($ch);

$header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$header = substr($response, 0, $header_size);
$body = substr($response, $header_size);

curl_close($ch);

$comments = sprintf("<!-- File generated in %s seconds -->\n", microtime(true) - $_SERVER["REQUEST_TIME_FLOAT"]);

// Save XML to file
file_put_contents($xml_file, $comments . $body);

$time_start = microtime(true);

// Load XML string
$xml = simplexml_load_string($body);

$filters = array(
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
);

// Exclude ways with specific filters
$ways_filter = '/osm/way[not(tag[' . implode(' or ', $filters) . '])]';

// Retrieve node IDs from ways
$nodeIds = array_map($collapseXpathAttributes, $xml->xpath($ways_filter . '/nd/@ref'));

// Only keep nodes that repeat over 2 ways or more
$nodeIds = array_keys(array_filter(array_count_values($nodeIds), $filterOccurences));

// Keys & values identical
$nodeIds = array_combine($nodeIds, $nodeIds);

$intersections = array();

foreach($xml->xpath('/osm/node') as $node) {
	$attributes = $node->attributes();
	
	if (isset($nodeIds[(string)$attributes->id])) {

		$ways = $xml->xpath($ways_filter . '/nd[@ref="' . (string)$attributes->id . '"]/parent::way/@id');
		$followingNodes = $xml->xpath($ways_filter . '/nd[@ref="' . (string)$attributes->id . '"]/following-sibling::nd[1]/@ref');
		$precedingNodes = $xml->xpath($ways_filter . '/nd[@ref="' . (string)$attributes->id . '"]/preceding-sibling::nd[1]/@ref');
		
		$adjacentNodes = @array_merge($followingNodes, $precedingNodes);
		
		$ways = (!empty($ways)) ? array_map($collapseXpathAttributes, $ways) : array();
		$adjacentNodes = (!empty($adjacentNodes)) ? array_map($collapseXpathAttributes, $adjacentNodes) : array();
		
		$intersections[] = array(
			'id' => (int)$attributes->id,
			'lat' => (float)$attributes->lat,
			'lng' => (float)$attributes->lon,
			'ways' => $ways,
			'adjacentNodes' => $adjacentNodes,
		);
	}
}

header('Content-type: application/json');

$json = json_encode($intersections, JSON_PRETTY_PRINT);

$comments = sprintf("<!-- File generated in %s seconds -->\n", microtime(true) - $_SERVER["REQUEST_TIME_FLOAT"]);

file_put_contents($json_file, $comments . $json);

echo $json;