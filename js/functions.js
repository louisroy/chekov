function xmlMapToArray (xml, func) {
	var arr = [];

	for (var i = 0; i < xml.snapshotLength; i++) {
		arr.push(func(xml.snapshotItem(i).nodeValue));
	}

	return arr;
}