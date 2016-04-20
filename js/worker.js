this.onmessage = function (ev) {
    var nodeId = ev.data.nodeId;
    var oParser = new DOMParser();
    var xml = oParser.parseFromString(ev.data.xml, "text/xml");

    var currentNode = xml.evaluate(
        '/osm/node[@id="' + nodeId + '"]',
        xml,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
    );

    // TODO : Adjacent nodes are still missing in some places

    var adjacentNodes = xml.evaluate(
        '/osm/way/nd[@ref="' + nodeId + '"]/following-sibling::nd[1]/@ref | /osm/way/nd[@ref="' + nodeId + '"]/preceding-sibling::nd[1]/@ref',
        xml,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
    );

    // Unique adjacent nodes IDs
    var adjacents = _.uniq(xmlMapToArray(adjacentNodes, parseInt));

    // Build description user in the InfoBox
    var description = [];
    description.push('<strong>' + nodeId + '</strong>');
    description.push('Adjacent nodes:');
    description.push(adjacents.join(', '));
    description.push('XML: ');
    description.push($('<div />').text(new XMLSerializer().serializeToString(currentNode.singleNodeValue)).html());

    var intersection = {
        id: nodeId,
        description: '<div style="width:200px;">' + description.join('<br />') + '</div>',
        lat: parseFloat(currentNode.singleNodeValue.attributes.getNamedItem('lat').value),
        lng: parseFloat(currentNode.singleNodeValue.attributes.getNamedItem('lon').value),
        adjacentNodes: adjacents
    };

    this.postMessage({intersection:intersection});
};