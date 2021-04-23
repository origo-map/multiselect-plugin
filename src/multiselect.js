import Origo from 'Origo';
import buffer from '@turf/buffer';
import disjoint from '@turf/boolean-disjoint';

const Multiselect = function Multiselect(options = {}) {
  let selectSource;
  let isActive = false;
  let clickInteraction;
  let boxInteraction;
  let circleInteraction;
  let polygonInteraction;
  let bufferInteraction;
  let lineInteraction;
  let sketch;
  let radius;
  let radiusXPosition;
  let radiusYPosition;
  let radiusLengthTooltip;
  let radiusLengthTooltipElement;
  let bufferFeature;
  let debugLayer;
  let map;
  let activeButton;
  let defaultButton;
  let type;
  let viewer;
  let multiselectButton;
  let clickSelectionButton;
  let polygonSelectionButton;
  let boxSelectionButton;
  let circleSelectionButton;
  let bufferSelectionButton;
  let lineSelectionButton;
  let target;
  let multiselectElement;
  let selectionManager;
  const buttons = [];
  const clusterFeatureinfoLevel = 1;
  const hitTolerance = 0;

  const tools = Object.prototype.hasOwnProperty.call(options, 'tools') ? options.tools : ['click', 'box', 'circle', 'polygon', 'buffer', 'line'];
  const defaultTool = Object.prototype.hasOwnProperty.call(options, 'default') ? options.default : 'click';
  const lineBufferFactor = Object.prototype.hasOwnProperty.call(options, 'lineBufferFactor') && options.lineBufferFactor >= 1 ? options.lineBufferFactor : 1;
  const clickSelection = tools.includes('click');
  const boxSelection = tools.includes('box');
  const circleSelection = tools.includes('circle');
  const polygonSelection = tools.includes('polygon');
  const bufferSelection = tools.includes('buffer');
  const lineSelection = tools.includes('line');

  function setActive(state) {
    isActive = state;
  }

  function toggleMultiselection() {
    const detail = {
      name: 'multiselection',
      active: !isActive
    };
    viewer.dispatch('toggleClickInteraction', detail);
  }

  function getCenter(geometryIn) {
    const geometry = geometryIn.clone();
    const geomType = geometry.getType();

    let center;
    switch (geomType) {
      case 'Polygon':
        center = geometry.getInteriorPoint().getCoordinates();
        break;
      case 'MultiPolygon':
        center = geometry.getInteriorPoints().getCoordinates()[0];
        break;
      case 'Point':
        center = geometry.getCoordinates();
        break;
      case 'MultiPoint': // Modified for EK, case of undefined
        center = geometry[0] ? geometry[0].getCoordinates() : geometry.getFirstCoordinate();
        break;
      case 'LineString':
        center = geometry.getCoordinateAt(0.5);
        break;
      case 'MultiLineString':
        center = geometry.getLineStrings()[0].getCoordinateAt(0.5);
        break;
      case 'Circle':
        center = geometry.getCenter();
        break;
      default:
        center = undefined;
    }
    return center;
  }

  function cleanItem(item) {
    const tempItem = item.getFeature().getProperties();
    if (tempItem.geometry) { delete tempItem.geometry; }
    if (tempItem.textHtml) { delete tempItem.textHtml; }
    if (tempItem.geom) { delete tempItem.geom; }
    if (tempItem.state) { delete tempItem.state; }
    return JSON.stringify(tempItem);
  }

  function filterItems(items) {
    const newItems = [];
    const tempItems = [];

    items.forEach((item) => {
      const isWfsFeature = typeof item.length === 'undefined';
      if (item.length === 1 || isWfsFeature) {
        const tempItem = cleanItem(isWfsFeature ? item : item[0]);

        if (!tempItems.includes(tempItem)) {
          tempItems.push(tempItem);
          newItems.push(isWfsFeature ? item : item[0]);
        }
      } else if (item.length > 1) {
        item.forEach((innerItem) => {
          const tempItem = cleanItem(innerItem);

          if (!tempItems.includes(tempItem)) {
            tempItems.push(tempItem);
            newItems.push(innerItem);
          }
        });
      }
    });

    return newItems;
  }

  function checkForExistingSelection(items) {
    const tempSelectedItems = [];
    const notAlreadySelectedItems = [];

    items.forEach((item) => {
      const selectionGroup = item.getSelectionGroup();
      const selectedItems = selectionManager.getSelectedItemsForASelectionGroup(selectionGroup);
      const tempItem = cleanItem(item);

      if (selectedItems.length > 0) {
        selectedItems.forEach((selectedItem) => {
          const tempSelectedItem = cleanItem(selectedItem);

          if (!tempSelectedItems.includes(tempSelectedItem)) {
            tempSelectedItems.push(tempSelectedItem);
          }
        });
      }

      if (!tempSelectedItems.includes(tempItem)) {
        notAlreadySelectedItems.push(item);
      }
    });

    return notAlreadySelectedItems;
  }

  function getFeatureInfoForItems(allItems) {
    const clientResult = [];
    allItems.forEach((item) => {
      const layers = viewer.getQueryableLayers();
      const coordinate = getCenter(item.getFeature().getGeometry());
      const pixel = map.getPixelFromCoordinate(coordinate).map(x => Math.round(x));

      const res = Origo.getFeatureInfo.getFeaturesFromRemote({
        coordinate,
        layers,
        map,
        pixel
      }, viewer);
      clientResult.push(res);
    });

    Promise.all(clientResult).then((items) => {
      if (typeof items !== 'undefined' && items.length > 0) {
        const newItems = checkForExistingSelection(filterItems(items));

        if (newItems.length === 1) {
          selectionManager.addOrHighlightItem(newItems[0]);
        } else if (newItems.length > 1) {
          selectionManager.addItems(newItems);
        }
      }
    });
  }

  function checkInfoFormat(allItems) {
    let hasTextHtml = false;
    allItems.forEach((item) => {
      if (item.getLayer().get('infoFormat') === 'text/html') {
        hasTextHtml = true;
      }
    });
    return hasTextHtml;
  }

  function checkLayerParam(allItems, param, value) {
    let hasParam = false;
    allItems.forEach((item) => {
      if (item.getLayer().get(param) === value) {
        hasParam = true;
      }
    });
    return hasParam;
  }

  function addItemsToSelection(allItems) {
    const infoFormatIsTextHtml = checkInfoFormat(allItems);
    const isWfsLayer = checkLayerParam(allItems, 'type', 'WFS');

    if (infoFormatIsTextHtml && !isWfsLayer) {
      getFeatureInfoForItems(allItems);
    } else {
      const newItems = checkForExistingSelection(filterItems(allItems));
      if (newItems.length === 1) {
        selectionManager.addOrHighlightItem(newItems[0]);
      } else if (newItems.length > 1) {
        selectionManager.addItems(newItems);
      }
    }
  }

  function enableInteraction() {
    document.getElementById(multiselectButton.getId()).classList.add('active');
    if (clickSelection) {
      document.getElementById(clickSelectionButton.getId()).classList.remove('hidden');
    }
    if (boxSelection) {
      document.getElementById(boxSelectionButton.getId()).classList.remove('hidden');
    }
    if (circleSelection) {
      document.getElementById(circleSelectionButton.getId()).classList.remove('hidden');
    }
    if (polygonSelection) {
      document.getElementById(polygonSelectionButton.getId()).classList.remove('hidden');
    }
    if (bufferSelection) {
      document.getElementById(bufferSelectionButton.getId()).classList.remove('hidden');
    }
    if (lineSelection) {
      document.getElementById(lineSelectionButton.getId()).classList.remove('hidden');
    }
    document.getElementById(multiselectButton.getId()).classList.remove('tooltip');
    setActive(true);
    addInteractions();
    document.getElementById(defaultButton.getId()).click();
    // if features are added to selection managaer from featureinfo, this will clear that selection when activating multiselect.
    // selectionManager.clearSelection();
  }

  function disableInteraction() {
    if (activeButton) {
      document.getElementById(activeButton.getId()).classList.remove('active');
    }
    document.getElementById(multiselectButton.getId()).classList.remove('active');
    if (clickSelection) {
      document.getElementById(clickSelectionButton.getId()).classList.add('hidden');
    }
    if (boxSelection) {
      document.getElementById(boxSelectionButton.getId()).classList.add('hidden');
    }
    if (circleSelection) {
      document.getElementById(circleSelectionButton.getId()).classList.add('hidden');
    }
    if (polygonSelection) {
      document.getElementById(polygonSelectionButton.getId()).classList.add('hidden');
    }
    if (bufferSelection) {
      document.getElementById(bufferSelectionButton.getId()).classList.add('hidden');
    }
    if (lineSelection) {
      document.getElementById(lineSelectionButton.getId()).classList.add('hidden');
    }
    document.getElementById(multiselectButton.getId()).classList.add('tooltip');

    removeInteractions();
    removeRadiusLengthTooltip();
    debugLayer.clear();
    selectionManager.clearSelection();
    setActive(false);
  }

  function addInteractions() {
    clickInteraction = new Origo.ol.interaction.Pointer({
      handleEvent: fetchFeatures_Click
    });

    boxInteraction = new Origo.ol.interaction.Draw({
      source: selectSource,
      type: 'Circle',
      geometryFunction: Origo.ol.interaction.Draw.createBox()
    });

    circleInteraction = new Origo.ol.interaction.Draw({
      source: selectSource,
      type: 'Circle'
    });

    polygonInteraction = new Origo.ol.interaction.Draw({
      source: selectSource,
      type: 'Polygon'
    });

    bufferInteraction = new Origo.ol.interaction.Pointer({
      handleEvent: fetchFeatures_Buffer_click
    });

    lineInteraction = new Origo.ol.interaction.Draw({
      source: selectSource,
      type: 'LineString'
    });

    map.addInteraction(clickInteraction);
    map.addInteraction(boxInteraction);
    map.addInteraction(circleInteraction);
    map.addInteraction(polygonInteraction);
    map.addInteraction(bufferInteraction);
    map.addInteraction(lineInteraction);

    boxInteraction.on('drawend', fetchFeatures_Box);
    circleInteraction.on('drawstart', (evt) => {
      sketch = evt.feature.getGeometry();
      createRadiusLengthTooltip();
    });
    circleInteraction.on('drawend', fetchFeatures_Circle);
    polygonInteraction.on('drawstart', (evt) => { });
    polygonInteraction.on('drawend', fetchFeatures_Polygon);
    lineInteraction.on('drawstart', () => { });
    lineInteraction.on('drawend', fetchFeatures_LineString);
  }

  function toggleType(button) {
    if (activeButton) {
      document.getElementById(activeButton.getId()).classList.remove('active');
    }

    document.getElementById(button.getId()).classList.add('active');
    activeButton = button;

    if (type === 'click') {
      clickInteraction.setActive(true);
      boxInteraction.setActive(false);
      circleInteraction.setActive(false);
      polygonInteraction.setActive(false);
      bufferInteraction.setActive(false);
      lineInteraction.setActive(false);
      map.un('pointermove', pointerMoveHandler);
    } else if (type === 'box') {
      clickInteraction.setActive(false);
      boxInteraction.setActive(true);
      circleInteraction.setActive(false);
      polygonInteraction.setActive(false);
      bufferInteraction.setActive(false);
      lineInteraction.setActive(false);
      map.un('pointermove', pointerMoveHandler);
    } else if (type === 'circle') {
      clickInteraction.setActive(false);
      boxInteraction.setActive(false);
      circleInteraction.setActive(true);
      polygonInteraction.setActive(false);
      bufferInteraction.setActive(false);
      lineInteraction.setActive(false);
      map.on('pointermove', pointerMoveHandler);
    } else if (type === 'polygon') {
      clickInteraction.setActive(false);
      boxInteraction.setActive(false);
      circleInteraction.setActive(false);
      polygonInteraction.setActive(true);
      bufferInteraction.setActive(false);
      lineInteraction.setActive(false);
      map.un('pointermove', pointerMoveHandler);
    } else if (type === 'buffer') {
      clickInteraction.setActive(false);
      boxInteraction.setActive(false);
      circleInteraction.setActive(false);
      polygonInteraction.setActive(false);
      bufferInteraction.setActive(true);
      lineInteraction.setActive(false);
      map.un('pointermove', pointerMoveHandler);
    } else if (type === 'line') {
      clickInteraction.setActive(false);
      boxInteraction.setActive(false);
      circleInteraction.setActive(false);
      polygonInteraction.setActive(false);
      bufferInteraction.setActive(false);
      lineInteraction.setActive(true);
      map.un('pointermove', pointerMoveHandler);
    }
  }

  function removeInteractions() {
    map.removeInteraction(clickInteraction);
    map.removeInteraction(boxInteraction);
    map.removeInteraction(circleInteraction);
    map.removeInteraction(polygonInteraction);
    map.removeInteraction(bufferInteraction);
    map.removeInteraction(lineInteraction);
  }

  function fetchFeatures_Click(evt) {
    // const point = evt.feature.getGeometry().getCoordinates();
    if (evt.type === 'singleclick') {
      const isCtrlKeyPressed = evt.originalEvent.ctrlKey;
      // Featurinfo in two steps. Concat serverside and clientside when serverside is finished
      const pixel = evt.pixel;
      const coordinate = evt.coordinate;
      const layers = viewer.getQueryableLayers();
      const clientResult = Origo.getFeatureInfo.getFeaturesAtPixel({
        coordinate,
        map,
        pixel,
        clusterFeatureinfoLevel,
        hitTolerance
      }, viewer);
      // Abort if clientResult is false
      if (clientResult !== false) {
        Origo.getFeatureInfo.getFeaturesFromRemote({
          coordinate,
          layers,
          map,
          pixel
        }, viewer)
          .then((data) => {
            const serverResult = data || [];
            const result = serverResult.concat(clientResult);
            if (isCtrlKeyPressed) {
              if (result.length > 0) {
                selectionManager.removeItems(result);
              }
            } else {
              addItemsToSelection(result);
            }
          });
      }
      return false;
    }
    return true;
  }

  function fetchFeatures_Box(evt) {
    const extent = evt.feature.getGeometry().getExtent();
    const box = evt.feature.getGeometry();
    const layers = viewer.getQueryableLayers();

    if (layers.length < 1) {
      return;
    }

    let allItems = [];
    const results = getItemsIntersectingExtent(layers, extent);
    // adding cleint features
    allItems = allItems.concat(getItemsIntersectingGeometry(results.selectedClientItems, box));

    // adding features got from wfs GetFeature
    Promise.all(results.selectedRemoteItemsPromises).then((data) => {
      // data is an array containing corresponding array of features for each layer.
      data.forEach((items) => { allItems = allItems.concat(getItemsIntersectingGeometry(items, box)); });
      addItemsToSelection(allItems);
    }).catch((err) => console.error(err));
  }

  function fetchFeatures_Circle(evt) {
    // Things needed to be done on 'drawend'
    // ==>
    sketch = null;
    removeRadiusLengthTooltip();
    // <==

    const circle = evt.feature.getGeometry();
    // const center = circle.getCenter();
    // const radius = circle.getRadius();
    const extent = circle.getExtent();
    const layers = viewer.getQueryableLayers();

    let allItems = [];
    const results = getItemsIntersectingExtent(layers, extent);

    // adding clint features
    allItems = allItems.concat(getItemsIntersectingGeometry(results.selectedClientItems, circle));

    // adding features got from wfs GetFeature
    Promise.all(results.selectedRemoteItemsPromises).then((data) => {
      // data is an array containing corresponding arrays of features for each layer.
      data.forEach((items) => { allItems = allItems.concat(getItemsIntersectingGeometry(items, circle)); });
      addItemsToSelection(allItems);
    });

    // Uncomment this to draw the extent on the map for debugging porposes
    // const f = new Feature(fromExtent(extent));
    // debugLayer.addFeature(f);
  }

  function fetchFeatures_Polygon(evt) {
    const polygon = evt.feature.getGeometry();
    const extent = polygon.getExtent();
    const layers = viewer.getQueryableLayers();

    let allItems = [];
    const results = getItemsIntersectingExtent(layers, extent);

    // adding clint features
    allItems = allItems.concat(getItemsIntersectingGeometry(results.selectedClientItems, polygon));

    // adding features got from wfs GetFeature
    Promise.all(results.selectedRemoteItemsPromises).then((data) => {
      // data is an array containing corresponding arrays of features for each layer.
      data.forEach((items) => { allItems = allItems.concat(getItemsIntersectingGeometry(items, polygon)); });
      addItemsToSelection(allItems);
    });

    // Uncomment this to draw the extent on the map for debugging porposes
    // const f = new Feature(fromExtent(extent));
    // debugLayer.addFeature(f);
  }

  function fetchFeatures_Buffer_click(evt) {
    if (evt.type === 'singleclick') {
      // Featurinfo in two steps. Concat serverside and clientside when serverside is finished
      const pixel = evt.pixel;
      const coordinate = evt.coordinate;
      const layers = viewer.getQueryableLayers();
      const clientResult = Origo.getFeatureInfo.getFeaturesAtPixel({
        coordinate,
        map,
        pixel,
        clusterFeatureinfoLevel,
        hitTolerance
      }, viewer);
      // Abort if clientResult is false
      if (clientResult !== false) {
        Origo.getFeatureInfo.getFeaturesFromRemote({
          coordinate,
          layers,
          map,
          pixel
        }, viewer)
          .then((data) => {
            const serverResult = data || [];
            const result = serverResult.concat(clientResult);
            if (result.length > 0) {
              let promise;
              if (result.length === 1) {
                bufferFeature = result[0].getFeature().clone();
                promise = Promise.resolve();
              } else if (result.length > 1) {
                promise = createFeatureSelectionModal(result);
              }
              promise.then(() => createRadiusModal());
            }
          });
      }
      return false;
    }
    return true;
  }

  function fetchFeatures_LineString(evt) {
    const line = evt.feature.getGeometry();
    const extent = line.getExtent();
    const layers = viewer.getQueryableLayers();

    let allItems = [];
    const results = getItemsIntersectingExtent(layers, extent);

    allItems = allItems.concat(getItemsIntersectingGeometry(results.selectedClientItems, line));

    Promise.all(results.selectedRemoteItemsPromises).then((data) => {
      data.forEach((items) => { allItems = allItems.concat(getItemsIntersectingGeometry(items, line)); });
      addItemsToSelection(allItems);
    });

    // Uncomment this to draw the extent on the map for debugging porposes
    // const f = new Feature(fromExtent(extent));
    // debugLayer.addFeature(f);
  }

  function createFeatureSelectionModal(items) {
    // extracting features
    const features = items.map((item) => item.getFeature());
    const featuresList = items.map((item) => {
      const layerAttributes = item.getLayer().get('attributes');
      const bufferAttribute = layerAttributes ? layerAttributes[0].name ? layerAttributes[0].name : undefined : undefined;
      const layerName = item.getLayer().get('title');
      const feature = item.getFeature();
      const title = feature.get(bufferAttribute) || feature.get('namn') || feature.getId();
      const titleEl = layerName ? `<span><b>${title}</b> (${layerName})</span>` : `<span>${title}</span>`;
      return `<div class="featureSelectorItem" id="${feature.getId()}"> ${titleEl} </div>`;
    });

    return new Promise((resolve) => {
      const title = 'Du har valt flera objekt:';
      const content = `<div id="featureSelector">
                        ${featuresList.join('')}
                      </div>`;
      const target = viewer.getId();
      const modal = Origo.ui.Modal({
        title,
        content,
        target
      });
      const featureSelectors = document.getElementsByClassName('featureSelectorItem');

      for (let index = 0; index < featureSelectors.length; index++) {
        const f = featureSelectors[index];
        f.addEventListener('click', function (e) {
          bufferFeature = features.find((ff) => ff.getId().toString() === this.id).clone();
          modal.closeModal();
          resolve();
          e.stopPropagation();
        });
      }
    });
  }

  function createRadiusModal() {
    const title = 'Ange buffert i meter (ex 10,4):';
    const content = `<div>
                      <input type="number" id="bufferradius">
                      <button id="bufferradiusBtn">OK</button>
                    </div>`;
    const target = viewer.getId();
    const modal = Origo.ui.Modal({
      title,
      content,
      target
    });
    const bufferradiusEl = document.getElementById('bufferradius');
    const bufferradiusBtn = document.getElementById('bufferradiusBtn');
    bufferradiusBtn.addEventListener('click', (e) => {
      const radiusVal = bufferradiusEl.value;
      // entered value should only be a number
      // const pattern = /^[0-9]*$/;
      // const onlyNumbers = pattern.test(radiusVal);
      // console.log(onlyNumbers);
      const radius = parseFloat(radiusVal);
      if ((!radius && radius !== 0)
        || (radius <= 0 && (bufferFeature.getGeometry().getType() === GeometryType.POINT
          || bufferFeature.getGeometry().getType() === GeometryType.MULTI_POINT
          || bufferFeature.getGeometry().getType() === GeometryType.MULTI_LINE_STRING
          || bufferFeature.getGeometry().getType() === GeometryType.LINE_STRING))) {
        bufferradiusEl.classList.add('unvalidValue');
        e.stopPropagation();
        return;
      }
      e.stopPropagation();
      modal.closeModal();
      // TODO: validating radius(only number, min, max)
      fetchFeatures_Buffer_buffer(radius);
    });
  }

  function fetchFeatures_Buffer_buffer(radius) {
    const geometry = bufferFeature.getGeometry();
    const bufferedFeature = createBufferedFeature(geometry, radius);
    const bufferedGeometry = bufferedFeature.getGeometry();
    const extent = bufferedGeometry.getExtent();
    const layers = viewer.getQueryableLayers();

    // Uncomment this to draw the extent of the buffer on the map for debugging porposes
    // const f = new Feature(fromExtent(extent));
    // debugLayer.addFeature(f);

    let allItems = [];
    const results = getItemsIntersectingExtent(layers, extent);

    // adding clint features
    allItems = allItems.concat(getItemsIntersectingGeometry(results.selectedClientItems, bufferedGeometry));

    // adding features got from wfs GetFeature
    Promise.all(results.selectedRemoteItemsPromises).then((data) => {
      // data is an array containing corresponding arrays of features for each layer.
      data.forEach((items) => { allItems = allItems.concat(getItemsIntersectingGeometry(items, bufferedGeometry)); });
      addItemsToSelection(allItems);
    });
  }

  // General function that recieves a geometry and a radius and returns a buffered feature
  function createBufferedFeature(geometry, radius) {
    const format = new Origo.ol.format.GeoJSON();
    const projection = map.getView().getProjection();
    let turfGeometry;

    if (geometry.getType() === 'Circle') {
      // circle is not a standard geometry. we need to create a polygon first.
      const polygon = Origo.ol.geom.Polygon.fromCircle(geometry);
      polygon.transform(projection, 'EPSG:4326');
      turfGeometry = format.writeGeometryObject(polygon);
    } else {
      geometry.transform(projection, 'EPSG:4326');
      turfGeometry = format.writeGeometryObject(geometry);
    }

    // OBS! buffer always return a feature
    const bufferedTurfFeature = buffer(turfGeometry, radius / 1000, { units: 'kilometers' });
    const bufferedOLFeature = format.readFeature(bufferedTurfFeature);
    bufferedOLFeature.getGeometry().transform('EPSG:4326', projection);

    // Uncomment this to draw the geometry for debugging puposes.
    // const f = bufferedOLFeature.clone();
    // debugLayer.addFeature(f);

    return bufferedOLFeature.clone();
  }

  // General function that recieves an extent and some layers and returns all features in those layers that intersect the extent.
  function getItemsIntersectingExtent(layers, extent) {
    const selectedClientItems = [];
    const selectedRemoteItemsPromises = [];

    function extractResultsForALayer(layer, groupLayer) {
      let selectionGroup;
      let selectionGroupTitle;

      if (groupLayer) {
        selectionGroup = groupLayer.get('name');
        selectionGroupTitle = groupLayer.get('title');
      } else {
        selectionGroup = layer.get('name');
        selectionGroupTitle = layer.get('title');
      }

      // We need to check manually if layer is in the visible range considering maxResolution and minResolution for a layer.
      // For click we do not need this check because the function "forEachFeatureAtPixel" on the map object takes care of that out of the box.
      // Also we need to check if the layer is "queryable". The reason is that if the layer is a normal layer, this check is already done, but if it is sublayer of a group then the check is needed here.
      if (shouldSkipLayer(layer)) {
        return;
      }

      // check if layer supports this method, or basically is some sort of vector layer.
      // Alternatively we can check layer.getType() === 'VECTOR', but a bit unsure if all types of vector layer have 'VECTOR' as type.
      // Basically here we get all vector features from client.
      if (layer.getSource().forEachFeatureIntersectingExtent) {
        layer.getSource().forEachFeatureIntersectingExtent(extent, (feature) => {
          const item = new Origo.SelectedItem(feature, layer, map, selectionGroup, selectionGroupTitle);
          selectedClientItems.push(item);
        });
      } else {
        selectedRemoteItemsPromises.push(getFeaturesFromWfsServer(layer, extent, selectionGroup, selectionGroupTitle));
      }
    }

    function shouldSkipLayer(layer) {
      if (!layer.get('queryable')) {
        return true;
      }

      if (layer.get('ArcGIS')) {
        return true;
      }

      const resolution = map.getView().getResolution();
      if (resolution > layer.getMaxResolution() || resolution < layer.getMinResolution()) {
        return true;
      }

      return false;
    }

    layers.forEach((layer) => {
      if (layer.get('type') === 'GROUP') {
        const subLayers = layer.getLayers();
        subLayers.forEach((subLayer) => {
          if (subLayer.get('type') === 'GROUP') {
            console.log('LayersGroups deeper than one level are not handled!');
          } else {
            extractResultsForALayer(subLayer, layer);
          }
        });
      } else {
        extractResultsForALayer(layer);
      }
    });

    return {
      selectedClientItems,
      selectedRemoteItemsPromises
    };
  }

  // General function that recieves a list of features and a geometry, then removes all the features that lie outside of the geometry.
  // Do not confuse this function with getFeaturesIntersectingExtent!
  function getItemsIntersectingGeometry(items, _geometry) {
    const geometry = _geometry.clone();

    const format = new Origo.ol.format.GeoJSON();
    const projection = map.getView().getProjection();
    const resolution = map.getView().getResolution();
    let turfGeometry;

    if (geometry.getType() === 'Circle') {
      // circle is not a standard geometry. we need to create a polygon first.
      const polygon = Origo.ol.geom.Polygon.fromCircle(geometry);
      polygon.transform(projection, 'EPSG:4326');
      turfGeometry = format.writeGeometryObject(polygon);
    } else if (geometry.getType() === 'LineString') {
      const line = createBufferedFeature(geometry, resolution * lineBufferFactor).getGeometry();
      line.transform(projection, 'EPSG:4326');
      turfGeometry = format.writeGeometryObject(line);
    } else {
      geometry.transform(projection, 'EPSG:4326');
      turfGeometry = format.writeGeometryObject(geometry);
    }

    const intersectingItems = [];
    items.forEach((item) => {
      const feature = item.getFeature();
      feature.getGeometry().transform(projection, 'EPSG:4326');
      const turfFeature = format.writeFeatureObject(feature);
      const booleanDisjoint = disjoint(turfFeature, turfGeometry);

      if (!booleanDisjoint) {
        intersectingItems.push(item);
      }

      feature.getGeometry().transform('EPSG:4326', projection);
    });

    /*
    Uncomment this to draw the geometry for debugging puposes.
    const olFeature = format.readFeature(turfGeometry);
    olFeature.getGeometry().transform('EPSG:4326', projection);
    debugLayer.addFeature(olFeature);
    console.log(items.length);
    console.log(intersectingItems.length);
    */

    return intersectingItems;
  }

  function getFeaturesFromWfsServer(layer, extent, selectionGroup, selectionGroupTitle) {
    return new Promise(((resolve) => {
      const req = Origo.getFeature(null, layer, viewer.getMapSource(), viewer.getProjectionCode(), viewer.getProjection(), extent);
	  req.then((data) => {
        const selectedRemoteItems = data.map((feature) => new Origo.SelectedItem(feature, layer, map, selectionGroup, selectionGroupTitle));
        resolve(selectedRemoteItems);
      })
        .catch((err) => { console.error(err); });
    }));
  }

  function createRadiusLengthTooltip() {
    if (radiusLengthTooltipElement) {
      radiusLengthTooltipElement.parentNode.removeChild(radiusLengthTooltipElement);
    }

    radiusLengthTooltipElement = document.createElement('div');
    radiusLengthTooltipElement.className = 'o-tooltip o-tooltip-measure';

    radiusLengthTooltip = new Origo.ol.Overlay({
      element: radiusLengthTooltipElement,
      offset: [0, 0],
      positioning: 'bottom-center',
      stopEvent: false
    });

    map.addOverlay(radiusLengthTooltip);
  }

  function removeRadiusLengthTooltip() {
    map.removeOverlay(radiusLengthTooltip);
    //  viewer.removeOverlays(overlayArray);
  }

  function pointerMoveHandler(e) {
    if (!sketch) return;

    radius = sketch.getRadius();
    radiusLengthTooltipElement.innerHTML = `${radius.toFixed()} m`;
    radiusXPosition = (e.coordinate[0] + sketch.getCenter()[0]) / 2;
    radiusYPosition = (e.coordinate[1] + sketch.getCenter()[1]) / 2;
    radiusLengthTooltip.setPosition([radiusXPosition, radiusYPosition]);
  }

  return Origo.ui.Component({
    name: 'multiselection',
    onInit() {
      if (clickSelection || boxSelection || circleSelection || polygonSelection || bufferSelection) {
        multiselectElement = Origo.ui.Element({
          tagName: 'div',
          cls: 'flex column'
        });

        multiselectButton = Origo.ui.Button({
          cls: 'o-multiselect padding-small margin-bottom-smaller icon-smaller round light box-shadow',
          click() {
            toggleMultiselection();
          },
          icon: '#baseline-select-all-24px',
          tooltipText: 'Multiselektering',
          tooltipPlacement: 'east'
        });
        buttons.push(multiselectButton);

        if (clickSelection) {
          clickSelectionButton = Origo.ui.Button({
            cls: 'o-multiselect-click padding-small margin-bottom-smaller icon-smaller round light box-shadow hidden',
            click() {
              type = 'click';
              toggleType(this);
            },
            icon: '#fa-mouse-pointer',
            tooltipText: 'Klick',
            tooltipPlacement: 'east'
          });
          buttons.push(clickSelectionButton);
          defaultButton = clickSelectionButton;
        }

        if (boxSelection) {
          boxSelectionButton = Origo.ui.Button({
            // o-home-in padding-small icon-smaller round light box-shadow o-tooltip
            cls: 'o-multiselect-box padding-small margin-bottom-smaller icon-smaller round light box-shadow hidden',
            click() {
              type = 'box';
              toggleType(this);
            },
            // icon: '#baseline-crop_square-24px',
            icon: '#fa-square-o',
            tooltipText: 'Ruta',
            tooltipPlacement: 'east'
          });
          buttons.push(boxSelectionButton);
        }

        if (circleSelection) {
          circleSelectionButton = Origo.ui.Button({
            cls: 'o-multiselect-circle padding-small margin-bottom-smaller icon-smaller round light box-shadow hidden',
            click() {
              type = 'circle';
              toggleType(this);
            },
            icon: '#fa-circle-o',
            tooltipText: 'Cirkel',
            tooltipPlacement: 'east'
          });
          buttons.push(circleSelectionButton);
        }

        if (polygonSelection) {
          polygonSelectionButton = Origo.ui.Button({
            cls: 'o-multiselect-polygon padding-small margin-bottom-smaller icon-smaller round light box-shadow hidden',
            click() {
              type = 'polygon';
              toggleType(this);
            },
            icon: '#fa-draw-polygon-o',
            tooltipText: 'Polygon',
            tooltipPlacement: 'east'
          });
          buttons.push(polygonSelectionButton);
        }

        if (bufferSelection) {
          bufferSelectionButton = Origo.ui.Button({
            cls: 'o-multiselect-buffer padding-small margin-bottom-smaller icon-smaller round light box-shadow hidden',
            click() {
              type = 'buffer';
              toggleType(this);
            },
            icon: '#fa-bullseye',
            tooltipText: 'Buffer',
            tooltipPlacement: 'east'
          });
          buttons.push(bufferSelectionButton);
        }

        if (lineSelection) {
          lineSelectionButton = Origo.ui.Button({
            cls: 'o-multiselect-line padding-small margin-bottom-smaller icon-smaller round light box-shadow hidden',
            click() {
              type = 'line';
              toggleType(this);
            },
            icon: '#fa-minus',
            tooltipText: 'Linje',
            tooltipPlacement: 'east'
          });
          buttons.push(lineSelectionButton);
        }

        if (defaultTool === 'click') {
          defaultButton = clickSelectionButton;
        } else if (defaultTool === 'box') {
          defaultButton = boxSelectionButton;
        } else if (defaultTool === 'circle') {
          defaultButton = circleSelectionButton;
        } else if (defaultTool === 'polygon') {
          defaultButton = polygonSelectionButton;
        } else if (defaultTool === 'buffer') {
          defaultButton = bufferSelectionButton;
        } else if (defaultTool === 'line') {
          defaultButton = lineSelectionButton;
        }
      }
    },
    onAdd(evt) {
      viewer = evt.target;
      target = `${viewer.getMain().getMapTools().getId()}`;
      map = viewer.getMap();
      selectionManager = viewer.getSelectionManager();
      // source object to hold drawn features that mark an area to select features from
      // Draw Interaction does not need a layer, only a source is enough for it to work.
      selectSource = new Origo.ol.source.Vector();
      const Style = Origo.ol.style;

      const debugStyle = [
        /* We are using two different styles:
         *  - The first style is for line & polygons geometries.
         *  - The second style is for point geometries.
         */
        new Style.Style({
          stroke: new Style.Stroke({
            color: 'rgba(255, 0, 0, 0.5)',
            width: 1
          }),
          fill: new Style.Fill({
            color: 'rgba(0, 0, 255, 0)'
          })
        }),
        new Style.Style({
          image: new Style.Circle({
            radius: 5,
            fill: new Style.Fill({
              color: 'red'
            })
          })
        })
      ];

      debugLayer = Origo.featurelayer(null, map);
      debugLayer.setStyle(debugStyle);

      this.addComponents(buttons);
      this.render();

      viewer.on('toggleClickInteraction', (detail) => {
        if (detail.name === 'multiselection' && detail.active) {
          enableInteraction();
        } else {
          disableInteraction();
        }
      });
    },
    render() {
      let htmlString = `${multiselectElement.render()}`;
      const dom = Origo.ui.dom;
      let el = dom.html(htmlString);
      document.getElementById(target).appendChild(el);

      htmlString = multiselectButton.render();
      el = dom.html(htmlString);
      document.getElementById(multiselectElement.getId()).appendChild(el);

      if (clickSelection) {
        htmlString = clickSelectionButton.render();
        el = dom.html(htmlString);
        document.getElementById(multiselectElement.getId()).appendChild(el);
      }
      if (boxSelection) {
        htmlString = boxSelectionButton.render();
        el = dom.html(htmlString);
        document.getElementById(multiselectElement.getId()).appendChild(el);
      }
      if (circleSelection) {
        htmlString = circleSelectionButton.render();
        el = dom.html(htmlString);
        document.getElementById(multiselectElement.getId()).appendChild(el);
      }
      if (polygonSelection) {
        htmlString = polygonSelectionButton.render();
        el = dom.html(htmlString);
        document.getElementById(multiselectElement.getId()).appendChild(el);
      }
      if (bufferSelection) {
        htmlString = bufferSelectionButton.render();
        el = dom.html(htmlString);
        document.getElementById(multiselectElement.getId()).appendChild(el);
      }
      if (lineSelection) {
        htmlString = lineSelectionButton.render();
        el = dom.html(htmlString);
        document.getElementById(multiselectElement.getId()).appendChild(el);
      }

      this.dispatch('render');
    }
  });
};

export default Multiselect;
