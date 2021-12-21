# Multiselect plugin

**PLEASE NOTE THAT THIS IS A BETA VERSION**

Multiselect plugin for Origo.


#### Example usage of Multiselect plugin

**index.html:**
```
    <head>
    	<meta charset="utf-8">
    	<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    	<meta http-equiv="X-UA-Compatible" content="IE=Edge;chrome=1">
    	<title>Origo exempel</title>
    	<link href="css/style.css" rel="stylesheet">
    </head>
    <body>
    <div id="app-wrapper">
    </div>
    <script src="js/origo.js"></script>
    <script src="plugins/multiselect.min.js"></script>

    <script type="text/javascript">
      //Init origo
      var origo = Origo('index.json');
      origo.on('load', function (viewer) {
        var multiselect = Multiselect();
        viewer.addComponent(multiselect);
      });
    </script>
```

## Configuration
The Multiselect function takes one argumnet which is an options object that can have the following properties:

### Options
Property | Description | Default value
--- | --- | ---
tools | Which tools are available. Array of ['click', 'box', 'circle', 'polygon', 'buffer', 'line']. | All
default | Which tool is default (string) | 'click'
lineBufferFactor | How much a line should be buffered before intersecting (pixels) | 1
selectableLayers | Array of available layerConfigurations. If more than one layerConfiguration is present, a configuration selector tool is available. | All visible
currentLayerConfig | Index of the selected layerConfiguration at startup | 0
pointBufferFactor | How much a point should be buffered before intersecting when using click tool. Does not apply if active configuration is All visible, as that uses featureInfo hitTolerance setting. | 1

#### layerConfiguration
A layerConfiguration specifies which layers are available for selecting features from.

Property | Description | Required
--- | --- | ---
name | Name of the configuration. Displayed in the configuration selection tool | Yes
layers | Array of layer names that features can be selected from. If omitted all visible layers are used. If layer name is a group layer, all layers in the group are included unless explicitly excluded. | No
exclude | Array of layer names that are excluded from feature selection. | No

Example:
```javascript
const selectableLayers = [
            {
                name: 'All visible'
            },
            {
                name: 'The big selection',
                layers: [
                    "InterestingPoints",
                    "InterestingLines",
                    "sketchgroup"
                ],
                exclude: [
                    "SketchPoint"
                ]
            },
            {
                name: 'Something completely different',
                layers: [
                    "Junkyards",
                    "Campsites"
                ]
            }
        ];
```

## Known limitations

- Only WFS and AGS Feature layers are "fully" supported
- WMS layers are supported if there is a WFS endpoint at the same URL as the WMS source. 
- WMS layers must have same default SRS as the map
- WFS layers must have the same defult SRS as the map if using bbox strategy and a layerConfiguration that uses the layer property.
- When using the default All visible configuration and WFS layers are using bbox strategy and and selecting with a larger object than visible on the screen (e.g. using a big buffer), objects outside the screen are not selected if they haven't been read before in another extent. 

