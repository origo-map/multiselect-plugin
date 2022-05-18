# Multiselect plugin

**PLEASE NOTE THAT THIS IS A BETA VERSION**

Multiselect plugin for Origo. It adds a new toolbox that contains tools for selecting features using more advanced methods than origo
natively supports.

Features can be selected using:
- Point. Click in the map. Ctrl-click to remove from selection.
- Line. Draw a line on the map to select overlapping features.
- Rectangle. Draw a rectangle on the map to select overlapping features.
- Circle. Draw a circle on the map to select overlapping features.
- Polygon. Draw a polygon on the map to select overlapping features.
- Buffer around another feature. Select a feature from any layer, optionally add a buffer radius to to select features overlapping the buffer area. 

## Usage
The plugin is added to origo by including the multiselect.min.js script. It contains one publicly available function _Multiselect()_, which
creates a origo component, which in turn is added to origo. The plugin is configured in javascript using an optional argument to _Multiselect()_.


### Example usage of Multiselect plugin


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
        const msConfig = {
          lineBufferFactor: 5
        };
        var multiselect = Multiselect(msConfig);
        viewer.addComponent(multiselect);
      });
    </script>
```


### Options
The optional argument to Multiselect is an object which can have the following properties:

Property | Description | Default value
--- | --- | ---
tools | Which tools are available. Array of ['click', 'box', 'circle', 'polygon', 'buffer', 'line']. | All
default | Which tool is default (string) | 'click'
lineBufferFactor | How much a line should be buffered before intersecting (pixels) | 1
selectableLayers | Array of available layerConfigurations. If more than one layerConfiguration is present, a configuration selector tool is available. | All visible
currentLayerConfig | Index of the selected layerConfiguration at startup | 0
pointBufferFactor | How much a point should be buffered before intersecting when using click tool. Does not apply if active configuration is All visible, as that uses featureInfo hitTolerance setting. | 1
bufferSymbol | Name of a symbol in origo configuration to use as symbol for buffered objects. Symbol is always a polygon. | A built-in symbol
chooseSymbol | Name of a symbol in origo configuration to use as symbol for highlighted features when choosing which feature to buffer. Symbol should handle point, line and polygon. | A built-in symbol

#### layerConfiguration
A layerConfiguration specifies in which layers features are selected. The default behaviour is to select features in all currently visible
layers, but when a _layerConfiguration_ that specifies layers or groups, features are always selected from those layers regardeless of their
visibility and not from any other layers.

Property | Description | Required
--- | --- | ---
name | Name of the configuration. Displayed in the configuration selection tool | Yes
layers | Array of layer names that features are selected from. If omitted all visible layers are used. If layer name is a group layer, all layers in the group are included unless explicitly excluded. | No
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

