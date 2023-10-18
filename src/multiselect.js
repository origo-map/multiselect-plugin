import Origo from 'Origo';
import buffer from '@turf/buffer';
import disjoint from '@turf/boolean-disjoint';
import { geometryCollection } from '@turf/helpers';
import { featureEach } from '@turf/meta';
import * as defaultstyles from './defaultstyles';

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
  let temporaryLayer;
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
  let configSelectionButton;
  let target;
  let multiselectElement;
  let selectionManager;
  let featureInfo;
  /** name of symbol in origo configuration */
  let bufferSymbol;
  /** name of symbol in origo configuration */
  let chooseSymbol;

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
  // Add at least one default configuration to make life easier later
  const selectableLayers = options.selectableLayers ? options.selectableLayers : [{ name: 'Default' }];
  let currentLayerConfig = options.defaultLayerConfig ? selectableLayers[options.defaultLayerConfig] : selectableLayers[0];
  const pointBufferFactor = options.pointBufferFactor ? options.pointBufferFactor : 1;
  const useWMSFeatureInfo = options.WMSHandling && options.WMSHandling.source === 'WMS';
  const alternativeLayerConfiguration = options.alternativeLayers || [];
  const showClearButton = options.showClearButton === true;
  const showAddToSelectionButton = options.showAddToSelectionButton === true;
  let addToSelection = options.addToSelection !== false;

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

  /**
   * Internal helper to check if there are any selected items
   * */
  function hasSelection() {
    return selectionManager.getSelectedItems().getLength() > 0 || featureInfo.getSelectionLayer().getSource().getFeatures().length > 0;
  }

  function displayTemporaryFeature(feature, style) {
    const f = feature.clone();

    f.setStyle(style);
    temporaryLayer.addFeature(f);
  }

  /**
   * Displays a modal so the user can select which feature to select by.
   * @param {any} items
   */
  function createFeatureSelectionModal(items) {
    // extracting features
    const features = items.map(item => item.getFeature());
    const featuresList = items.map((item) => {
      const layerAttributes = item.getLayer().get('attributes');
      let bufferAttribute;
      if (layerAttributes && layerAttributes[0] && layerAttributes[0].name) {
        bufferAttribute = layerAttributes[0].name;
      }
      const layerName = item.getLayer().get('title');
      const feature = item.getFeature();
      const title = feature.get(bufferAttribute) || feature.get('namn') || feature.getId();
      const titleEl = layerName ? `<span><b>${title}</b> (${layerName})</span>` : `<span>${title}</span>`;
      // FIXME: add layername to id (or refactor to not use id at all) to support AGS and same source layers
      return `<div class="featureSelectorItem hover pointer" id="${feature.getId()}"> ${titleEl} </div>`;
    });

    return new Promise((resolve) => {
      const title = 'Du har valt flera objekt:';
      const content = `<div id="featureSelector">
                        ${featuresList.join('')}
                      </div>`;
      const mTarget = viewer.getId();
      const modal = Origo.ui.Modal({
        title,
        content,
        target: mTarget
      });
      const featureSelectors = document.getElementsByClassName('featureSelectorItem');

      for (let index = 0; index < featureSelectors.length; index++) {
        const f = featureSelectors[index];
        f.addEventListener('click', (e) => {
          bufferFeature = features.find(ff => ff.getId().toString() === this.id).clone();
          modal.closeModal();
          resolve();
          // Remove highlight here if user happens to close the buffer modal without submitting, as we don't know when that happens
          // In the future core may have an event on Modal when its closed.
          temporaryLayer.clear();
          e.stopPropagation();
        });
        f.addEventListener('mouseover', () => {
          const hoverFeature = features.find(ff => ff.getId().toString() === this.id).clone();
          displayTemporaryFeature(hoverFeature, chooseSymbol);
        });
        f.addEventListener('mouseout', () => {
          temporaryLayer.clear();
        });
      };
    });
  }

  /**
   * Displays a modal so the user can change settings.
   * */
  function showSettingsModal() {
    const title = 'Välj aktiv konfiguration:';
    const dropdownContainerId = 'dropdown-container';
    const content = `<div id="${dropdownContainerId}"></div>`;
    const mTarget = viewer.getId();
    const modal = Origo.ui.Modal({
      title,
      content,
      target: mTarget
    });

    let activeIndex;
    const selectOptions = selectableLayers.map((currConfig, ix) => {
      const obj = {};
      obj.name = currConfig.name;
      // Have to cast index to string in order for dropdown to make a correct comparison when setting active item
      obj.value = ix.toString();
      // Piggyback on the map loop to find active index.
      if (currConfig === currentLayerConfig) {
        activeIndex = ix.toString();
      }
      return obj;
    });
    // The drop down magically injects itself in the dropdown container
    Origo.dropdown(dropdownContainerId, selectOptions, {
      dataAttribute: 'index',
      active: activeIndex
    });

    // Drop down emits a custom event on the container element when selection is made
    document.getElementById(dropdownContainerId).addEventListener('changeDropdown', (e) => {
      currentLayerConfig = selectableLayers[parseInt(e.detail.dataAttribute, 10)];
      modal.closeModal();
    });
  }

  // General function that recieves a geometry and a radius and returns a buffered feature
  /**
   * Helper that buffers a geometry. The result is returned as a new feature.
   * @param {any} geometry
   * @param {any} radius
   * @returns A feature
   */
  function createBufferedFeature(geometry, fRadius) {
    temporaryLayer.clear();
    const format = new Origo.ol.format.GeoJSON();
    const projection = map.getView().getProjection();
    let turfGeometry;
    // Clone first to avoid messing up caller's geometry
    const geometryClone = geometry.clone();
    if (fRadius === 0) {
      // No need to buffer if buffer radius is 0. Also turf buffer drops points and lines in geometryCollections when radius i 0.
      return new Origo.ol.Feature(geometryClone);
    }

    if (geometryClone.getType() === 'Circle') {
      // circle is not a standard geometry. we need to create a polygon first.
      const polygon = Origo.ol.geom.Polygon.fromCircle(geometryClone);
      polygon.transform(projection, 'EPSG:4326');
      turfGeometry = format.writeGeometryObject(polygon);
    } else {
      // Have to transform as turf only works with WGS84.
      geometryClone.transform(projection, 'EPSG:4326');
      turfGeometry = format.writeGeometryObject(geometryClone);
    }

    // Buffer returns a feature or a FeatureCollection, not Geometry or GeometryCollection
    // This is not very elegant, as buffer does not dissolve the buffered geometries in a collection aginst each other
    let bufferedTurfFeature = buffer(turfGeometry, fRadius / 1000, { units: 'kilometers' });
    if (bufferedTurfFeature.type === 'FeatureCollection') {
      // Rebuild a GeometryCollection from FeatureCollection
      const geoms = [];
      // TODO: Also run a turf/union to dissolve collection?
      //       It would probaby also be necessary to explode multiparts in that case, as the parts may be scattered all over a large extent
      //       Exploding could be done here directly to a collection, or later when collection is exploded. The latter would also explode multiparts
      //       that were not buffered (when radius = 0).
      featureEach(bufferedTurfFeature, currFeat => geoms.push(currFeat.geometry));
      bufferedTurfFeature = geometryCollection(geoms);
    }
    const bufferedOLFeature = format.readFeature(bufferedTurfFeature);
    bufferedOLFeature.getGeometry().transform('EPSG:4326', projection);

    return bufferedOLFeature;
  }

  /**
   * Determines if a layer should be available for selection
   * @param {any} layer
   */
  function shouldSkipLayer(layer) {
    if (currentLayerConfig.exclude) {
      if (currentLayerConfig.exclude.some(l => layer.get('name') === l)) {
        // Explicitly excluded by config
        return true;
      }
    }
    if (currentLayerConfig.layers) {
      // We're only called if configured. No need to check again
      // This makes all layers in a group layer default in when using layer config
      return false;
    }

    // If we got here it means that no config is present, or current config is just a named default setting (use visible)


    // We need to check manually if layer is in the visible range considering maxResolution and minResolution for a layer.
    // For click we do not need this check because the function "forEachFeatureAtPixel" on the map object takes care of that out of the box.
    // Also we need to check if the layer is "queryable". The reason is that if the layer is a normal layer, this check is already done, but if it is sublayer of a group then the check is needed here.

    if (!layer.get('queryable')) {
      return true;
    }

    const resolution = map.getView().getResolution();
    if (resolution > layer.getMaxResolution() || resolution < layer.getMinResolution()) {
      return true;
    }

    return false;
  }

  /**
   * Helper to fectch features from a layer. Currently it does not support that the layer has another projection than the map,
   * but Origo is to blame here.
   * @param {any} layer
   * @param {any} extent
   * @return {feature[]} array of features
   */
  async function fetchFeaturesFromServer(layer, extent) {
    const fetchedFeatures = await Origo.getFeature(null, layer, viewer.getMapSource(), viewer.getProjectionCode(), viewer.getProjection(), extent);
    return fetchedFeatures;
  }

  /**
   * Helper that fetches features from server and creates an array of SelectedItem
   * @param {any} layer
   * @param {any} extent
   * @param {any} selectionGroup
   * @param {any} selectionGroupTitle
   */
  async function getRemoteItems(layer, extent, selectionGroup, selectionGroupTitle) {
    const features = await fetchFeaturesFromServer(layer, extent);
    const selectedRemoteItems = features.map(feature => new Origo.SelectedItem(feature, layer, map, selectionGroup, selectionGroupTitle));
    return selectedRemoteItems;
  }

  /**
   * Helper that returns all features that has an extent that intersects the given extent from the given layer as an array of SelectedItem
   * @param {any} layer
   * @param {any} groupLayer
   * @param {any} extent
   */
  async function extractResultsForALayer(layer, groupLayer, extent) {
    let selectionGroup;
    let selectionGroupTitle;
    let selectedItems = [];

    if (groupLayer) {
      selectionGroup = groupLayer.get('name');
      selectionGroupTitle = groupLayer.get('title');
    } else {
      selectionGroup = layer.get('name');
      selectionGroupTitle = layer.get('title');
    }

    // First see if we have a config that decides where to query
    const currLayerConfig = alternativeLayerConfiguration.find(i => i.name === layer.get('name'));
    // If layer is configured to do something special, obey that. Otherwise default to something.
    if (currLayerConfig) {
      const promises = [];
      if (currLayerConfig.queryInfoLayers) {
        currLayerConfig.queryInfoLayers.forEach((layerName) => {
          const qiLayer = viewer.getLayer(layerName);
          // Try to use same filter on queryInfoLayer as the original layer. Probably only works for simple filters on same type of server when
          // original layer is WMS and query layer is WFS, which happens to be the problem we're solving.
          // getParams only exists on WMS layers
          if (layer.getSource().getParams && !currLayerConfig.disableFilterHandling) {
            const params = layer.getSource().getParams();
            // TODO: get param name from layer's source "type", itroduced in 1407
            //       Awaits that the getSourceType utility function is exposed in api. Right now it is hidden inside print-resize.js
            // If the WMS layer has a filter, use the same filter on th WFS layer which is queried.
            if (Object.hasOwn(params, 'CQL_FILTER')) {
              // Origo.getFeature() reads the filter param for each call. If changing to WFSSource, the source option must be changed (which is "private")
              // Ideally wfs layer should have a listener and update source as well to keep it in sync
              // Note that this changes the filter on the layer itself permanently. Which makes it only useful when using a non visible layer
              // for this purpose only.
              qiLayer.set('filter', params.CQL_FILTER);
            }
          }
          promises.push(getRemoteItems(qiLayer, extent, selectionGroup, selectionGroupTitle));
        });
        try {
          const remoteitems = await Promise.all(promises);
          selectedItems = remoteitems.flat();
        } catch (e) {
          alert('Kunde inte kontakta servern. Resultatet är inte komplett');
          console.error(e);
        }
      }
    } else if (layer.getSource().forEachFeatureIntersectingExtent) {
      // check if layer supports this method, or basically is some sort of vector layer.
      // Alternatively we can check layer.getType() === 'VECTOR', but a bit unsure if all types of vector layer have 'VECTOR' as type.
      // Basically here we get all vector features from client.
      if (currentLayerConfig.layers && layer.get('type') === 'WFS' && layer.get('strategy') !== 'all') {
        // If Wfs is using bbox, the features may not have beeen fetched if layer is not visisble or features are out of view.
        // Fetch all intersecting features and add to layer. Then carry on as usual
        const serverFeatures = await fetchFeaturesFromServer(layer, extent);
        layer.getSource().addFeatures(serverFeatures);
      }
      layer.getSource().forEachFeatureIntersectingExtent(extent, (feature) => {
        // If clustered features should be supported they should be unwrapped here first.
        const item = new Origo.SelectedItem(feature, layer, map, selectionGroup, selectionGroupTitle);
        selectedItems.push(item);
      });
    } else if (layer.get('type') === 'WMS') {
      if (useWMSFeatureInfo) {
        // Make a featureinfo call and fake a "big" click that covers the entire extenet
        // For some reason a 1x1 map will yield a bunch of false positives. Probably because the server renders surrounding objects
        // and symbol becomes large enough to spill in to the map and the symbol is used to detect features.
        // Use a decently sized map and buffer center to cover entire extent.
        // Strangely it does not work with larger maps either. Probably Geoserver implementers did not expect anyone to use a 50 pixel click tolerance.
        // It doesn't really matter if we get false positives, they are filtered out later anyway.

        // Coord and resultion arguments don't matter now. The result of the calculation will be overwritten anyway.
        // This will retain any filter on layer source, whatever they are called, as most arguments are copied from source.
        const qiUrl = new URL(layer.getSource().getFeatureInfoUrl([0, 0], 100, viewer.getProjection(), {
          INFO_FORMAT: 'application/json',
          FEATURE_COUNT: '1000'
        }));

        // TODO: make configurable
        const fakeMapSize = '51';
        const rRadius = '36'; // covers the entire rectangle
        const halfFakeMapSize = '25';
        const params = qiUrl.searchParams;
        // Check what coord params to use. WMS 1.1. 0 uses X and Y, 1.3.0 uses I and J. getFeatureInfoUrl has already set these for us,
        // but they are calculated using the current view, and we want to fake a smaller map as the buffer arg can't be too big
        if (params.get('I')) {
          params.set('I', halfFakeMapSize);
          params.set('J', halfFakeMapSize);
        } else {
          params.set('X', halfFakeMapSize);
          params.set('Y', halfFakeMapSize);
        }
        params.set('BBOX', extent.toString());
        params.set('WIDTH', fakeMapSize);
        params.set('HEIGHT', fakeMapSize);
        // GeoServer only
        // TODO: Qgis has "radius". Get param name from layer's source "type", introduced in 1407
        //       Waiting for function to be exposed in api.
        params.set('buffer', rRadius);

        qiUrl.search = params.toString();
        const res = await fetch(qiUrl);
        const json = await res.json();

        const newFeatures = viewer.getMapUtils().geojsonToFeature(json);
        newFeatures.forEach((feature) => {
          const item = new Origo.SelectedItem(feature, layer, map, selectionGroup, selectionGroupTitle);
          selectedItems.push(item);
        });
      } else {
        // Fallback to default implementation, which just assumes that there is a WFS endpoint at the same adress as the WMS layer
        // It works for geoserver, but technically it is wrong as there is no WFS layer defined in origo.
        // If implementation of origo.getFeature changes, it may break.
        // It is only implemented as it was the default implementation from the start and left for backwards compatibility.
        const remoteItems = await getRemoteItems(layer, extent, selectionGroup, selectionGroupTitle);
        // Can't have both local and remote in same layer, so this is safe.
        selectedItems = remoteItems;
      }
    }
    return selectedItems;
  }

  /**
   * Displays the circe radius when selecting by circle.
   * */
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
  }

  function clearSelection() {
    removeRadiusLengthTooltip();
    temporaryLayer.clear();
    selectionManager.clearSelection();
  }

  /**
   * General function that returns all features intersecting a geometry
   * @param {any} items
   * @param {any} _geometry
   */
  function getItemsIntersectingGeometry(items, _geometry) {
    const geometry = _geometry.clone();

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

    const intersectingItems = [];
    items.forEach((item) => {
      // Clone first to avoid messing with the original feature as transform do an in place transformation
      const feature = item.getFeature().clone();
      feature.getGeometry().transform(projection, 'EPSG:4326');
      const turfFeature = format.writeFeatureObject(feature);
      const booleanDisjoint = disjoint(turfFeature, turfGeometry);

      if (!booleanDisjoint) {
        intersectingItems.push(item);
      }
    });

    return intersectingItems;
  }

  /**
   * Gets all features from the eligable layers intersecting the geometry and adds (or remove) them to SelectionManager.
   * @param {any} geometry The geometry to intersect
   * @param {any} remove true if selection should be removed insread of added
   */
  async function updateSelectionManager(geometry, remove) {
    if (!addToSelection) {
      clearSelection();
    }
    const promises = [];
    let layers;
    const extent = geometry.getExtent();

    /**
     * Recursively traverse all layers to discover all individual layers in group layers
     * @param {any} layers
     * @param {any} groupLayer
     */
    function traverseLayers(tLayers, groupLayer) {
      for (let i = 0; i < tLayers.length; i += 1) {
        const currLayer = tLayers[i];
        if (!shouldSkipLayer(currLayer)) {
          if (currLayer.get('type') === 'GROUP') {
            const subLayers = currLayer.getLayers().getArray();
            traverseLayers(subLayers, currLayer);
          } else if (geometry.getType() === 'GeometryCollection') {
            // Explode geometry collections as they very well have disjoint extents, which would result in tons of false positives.
            // TODO: Explode multiparts as well?
            //       It will result in more calls, but reduces scattered geometries in a large extent.
            geometry.getGeometries().forEach(currGeo => promises.push(extractResultsForALayer(currLayer, groupLayer, currGeo.getExtent())));
          } else {
            promises.push(extractResultsForALayer(currLayer, groupLayer, extent));
          }
        }
      }
    }

    if (currentLayerConfig.layers) {
      // Use configured layers
      layers = currentLayerConfig.layers.map(l => viewer.getLayer(l));
    } else {
      // Use queryable layers when no config exists (default behaviour)
      layers = viewer.getQueryableLayers(true);
    }

    // This call populates the promises array, so on the next line we can await it
    traverseLayers(layers);
    const items = await Promise.all(promises);
    // Is an array of arrays, we want an array.
    const allItems = items.flat();

    // Narrow down selection to only contain thos whose actual geometry intersects the selection geometry.
    // We could implement different spatial relations, i.e contains, is contained etc. But for now only intersect is supported.
    const intersectingItems = getItemsIntersectingGeometry(allItems, geometry);

    // Add them to selection
    // handle removal for point when ctrl-click
    if (remove) {
      if (intersectingItems.length > 0) {
        selectionManager.removeItems(intersectingItems);
      }
    } else if (intersectingItems.length === 1) {
      selectionManager.addOrHighlightItem(intersectingItems[0]);
    } else if (intersectingItems.length > 1) {
      selectionManager.addItems(intersectingItems);
    }
    // TODO: Notify user if result was empty to avoid them waiting for ever
  }

  /**
   * Selects features by an already selected feature (in a global variable) with a buffer.
   * @param {any} fRadius
   */
  function fetchFeaturesBufferBuffer(fRadius) {
    const geometry = bufferFeature.getGeometry();
    const bufferedFeature = createBufferedFeature(geometry, fRadius);
    displayTemporaryFeature(bufferedFeature, bufferSymbol);

    const bufferedGeometry = bufferedFeature.getGeometry();
    updateSelectionManager(bufferedGeometry);
  }

  /**
   * Displays a modal so the user can enter a buffer radius
   * */
  function createRadiusModal() {
    const title = 'Ange buffert i meter (ex 10,4):';
    const content = `<div>
                      <form id="radius-form">
                      <input type="number" id="bufferradius">
                      <button type="submit">OK</button>
                    </div></form>`;
    const mTarget = viewer.getId();
    const modal = Origo.ui.Modal({
      title,
      content,
      target: mTarget
    });
    const formEl = document.getElementById('radius-form');

    const bufferradiusEl = document.getElementById('bufferradius');
    bufferradiusEl.focus();

    formEl.addEventListener('submit', (e) => {
      // Don't want to actually submit form
      e.preventDefault();
      const radiusVal = bufferradiusEl.value;
      // Rely on browser to ensure type="number"
      const fRadius = parseFloat(radiusVal);

      // Not allowed to buffer inwards for 0 and 1 dimensional geometries
      if ((!fRadius && fRadius !== 0)
        || (fRadius <= 0 && (bufferFeature.getGeometry().getType() === 'Point'
          || bufferFeature.getGeometry().getType() === 'MultiPoint'
          || bufferFeature.getGeometry().getType() === 'MultiLineString'
          || bufferFeature.getGeometry().getType() === 'LineString'))) {
        return;
      }

      modal.closeModal();

      fetchFeaturesBufferBuffer(fRadius);
    });
  }

  /**
   * Event handler that updates the radius when slecting by circle
   * @param {any} e
   */
  function pointerMoveHandler(e) {
    if (!sketch) return;

    radius = sketch.getRadius();
    radiusLengthTooltipElement.innerHTML = `${radius.toFixed()} m`;
    radiusXPosition = (e.coordinate[0] + sketch.getCenter()[0]) / 2;
    radiusYPosition = (e.coordinate[1] + sketch.getCenter()[1]) / 2;
    radiusLengthTooltip.setPosition([radiusXPosition, radiusYPosition]);
  }

  /**
   * Invokes the select by selection flow
   * */
  function fetchFeaturesSelection() {
    // Get all selected geometries and put them in a GeometryCollection for further processing
    let geometries;
    if (featureInfo.getSelectionLayer().getSource().getFeatures().length > 0) {
      geometries = featureInfo.getSelectionLayer().getSource().getFeatures().map(f => f.getGeometry());
      // Clear previous selection if it came from popup, which most likely would be a searchresult.
      featureInfo.clear();
    } else {
      const selectedFeatures = selectionManager.getSelectedItems().getArray();
      geometries = selectedFeatures.map(item => item.getFeature().getGeometry());
    }
    // This geometry will most likely be converted to turf, which knows nothing about circles.
    geometries = geometries.map((currGeometry) => {
      if (currGeometry.getType() === 'Circle') {
        return Origo.ol.geom.Polygon.fromCircle(currGeometry);
      }
      return currGeometry;
    });
    const collection = new Origo.ol.geom.GeometryCollection(geometries);

    // Store the newly created feature in a global to be picked up later.
    bufferFeature = new Origo.ol.Feature(collection);
    createRadiusModal();
  }

  function toggleAddToSelection(button) {
    if (addToSelection) {
      addToSelection = false;
      button.setState('initial');
    } else {
      addToSelection = true;
      button.setState('active');
    }
  }

  function toggleType(button) {
    if (activeButton) {
      document.getElementById(activeButton.getId()).classList.remove('active');
    }

    function disableAll() {
      clickInteraction.setActive(false);
      boxInteraction.setActive(false);
      circleInteraction.setActive(false);
      polygonInteraction.setActive(false);
      bufferInteraction.setActive(false);
      lineInteraction.setActive(false);
      map.un('pointermove', pointerMoveHandler);
    }

    document.getElementById(button.getId()).classList.add('active');
    activeButton = button;

    disableAll();

    if (type === 'click') {
      clickInteraction.setActive(true);
    } else if (type === 'box') {
      boxInteraction.setActive(true);
    } else if (type === 'circle') {
      circleInteraction.setActive(true);
      map.on('pointermove', pointerMoveHandler);
    } else if (type === 'polygon') {
      polygonInteraction.setActive(true);
    } else if (type === 'buffer') {
      if (hasSelection()) {
        fetchFeaturesSelection();
      } else {
        bufferInteraction.setActive(true);
      }
    } else if (type === 'line') {
      lineInteraction.setActive(true);
    }
  }

  /**
   * Event handler for click event. Selects features by mouse click, almost like featureInfo
   * @param {any} evt
   */
  function fetchFeaturesClick(evt) {
    if (evt.type === 'singleclick') {
      const isCtrlKeyPressed = evt.originalEvent.ctrlKey;

      if (currentLayerConfig.layers) {
        // If configured with specific layers, we can't use the featureInfo functions to fecth features as they honour visibility
        const resolution = map.getView().getResolution();
        const point = new Origo.ol.geom.Point(evt.coordinate);
        // Buffer the point to make it emulate featureInfo radius.
        const geometry = createBufferedFeature(point, resolution * pointBufferFactor).getGeometry();
        updateSelectionManager(geometry, isCtrlKeyPressed);
      } else {
        if (!addToSelection && !isCtrlKeyPressed) {
          clearSelection();
        }
        // For backwards compability use featureInfo style when not using specific layer conf.
        // The featureInfo style will honour the alternative featureInfo layer and radius configuration in the core
        // also it unwinds clustering.
        // Featureinfo in two steps. Concat serverside and clientside when serverside is finished
        const pixel = evt.pixel;
        const coordinate = evt.coordinate;
        const layers = viewer.getQueryableLayers(true);
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
              } else if (result.length === 1) {
                selectionManager.addOrHighlightItem(result[0]);
              } else if (result.length > 1) {
                selectionManager.addItems(result);
              }
              const modalLinks = document.getElementsByClassName('o-identify-link-modal');
              for (let i = 0; i < modalLinks.length; i += 1) {
                viewer.getFeatureinfo().addLinkListener(modalLinks[i]);
              }
            });
        }
        return false;
      }
    }
    return true;
  }

  /**
   * Event handler for rectangle interaction. Selects features by a rectangle.
   * @param {any} evt
   */
  function fetchFeaturesBox(evt) {
    const geometry = evt.feature.getGeometry();
    updateSelectionManager(geometry);
  }

  /**
   * Event handler för circle interaction. Selects features by a circle.
   * @param {any} evt
   */
  function fetchFeaturesCircle(evt) {
    // Things needed to be done on 'drawend'
    // ==>
    sketch = null;
    removeRadiusLengthTooltip();
    // <==

    const geometry = evt.feature.getGeometry();
    updateSelectionManager(geometry);
  }

  /**
   * Event handler för polygon interaction. Selects features by a polygon.
   * @param {any} evt
   */
  function fetchFeaturesPolygon(evt) {
    const geometry = evt.feature.getGeometry();
    updateSelectionManager(geometry);
  }

  /**
   * Eventhandler for click when selecting by feature. Selects the feature to select by. If click hits severat features
   * a modal is displayed.
   * @param {any} evt
   */
  function fetchFeaturesBufferClick(evt) {
    if (evt.type === 'singleclick') {
      // Featurinfo in two steps. Concat serverside and clientside when serverside is finished
      const pixel = evt.pixel;
      const coordinate = evt.coordinate;
      const layers = viewer.getQueryableLayers(true);
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
  /**
   * Event handler for line interaction. Selects by line.
   * @param {any} evt
   */
  function fetchFeaturesLineString(evt) {
    const geometry = evt.feature.getGeometry();
    const resolution = map.getView().getResolution();
    // Buffer the line to make it possible to hit points with a line
    const bufferedGeometry = createBufferedFeature(geometry, resolution * lineBufferFactor).getGeometry();
    updateSelectionManager(bufferedGeometry);
  }

  function addInteractions() {
    clickInteraction = new Origo.ol.interaction.Pointer({
      handleEvent: fetchFeaturesClick
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
      handleEvent: fetchFeaturesBufferClick
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

    boxInteraction.on('drawend', fetchFeaturesBox);
    circleInteraction.on('drawstart', (evt) => {
      sketch = evt.feature.getGeometry();
      createRadiusLengthTooltip();
    });
    circleInteraction.on('drawend', fetchFeaturesCircle);
    polygonInteraction.on('drawend', fetchFeaturesPolygon);
    lineInteraction.on('drawend', fetchFeaturesLineString);
  }

  function enableInteraction() {
    document.getElementById(multiselectButton.getId()).classList.add('active');
    // This accidently unhides the multselect button. But that's OK.
    buttons.forEach((currButton) => {
      document.getElementById(currButton.getId()).classList.remove('hidden');
    });
    document.getElementById(multiselectButton.getId()).classList.remove('tooltip');
    setActive(true);
    addInteractions();
    document.getElementById(defaultButton.getId()).click();
    // if features are added to selection managaer from featureinfo, this will clear that selection when activating multiselect.
    // selectionManager.clearSelection();
  }

  function removeInteractions() {
    map.removeInteraction(clickInteraction);
    map.removeInteraction(boxInteraction);
    map.removeInteraction(circleInteraction);
    map.removeInteraction(polygonInteraction);
    map.removeInteraction(bufferInteraction);
    map.removeInteraction(lineInteraction);
  }

  function disableInteraction() {
    if (activeButton) {
      document.getElementById(activeButton.getId()).classList.remove('active');
    }
    document.getElementById(multiselectButton.getId()).classList.remove('active');
    buttons.forEach((currButton) => {
      if (currButton !== multiselectButton) {
        document.getElementById(currButton.getId()).classList.add('hidden');
      }
    });

    document.getElementById(multiselectButton.getId()).classList.add('tooltip');

    removeInteractions();
    clearSelection();
    setActive(false);
  }

  return Origo.ui.Component({
    name: 'multiselection',
    clearSelection,
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
          tooltipText: 'Markera i kartan',
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

        if (selectableLayers.length > 1) {
          configSelectionButton = Origo.ui.Button({
            cls: 'o-multiselect-config padding-small margin-bottom-smaller icon-smaller round light box-shadow hidden',
            click() {
              showSettingsModal();
            },
            icon: '#ic_tune_24px',
            tooltipText: 'Inställningar',
            tooltipPlacement: 'east'
          });
          buttons.push(configSelectionButton);
        }

        if (showAddToSelectionButton) {
          const addToSelectionButton = Origo.ui.Button({
            cls: 'o-multiselect-add padding-small margin-bottom-smaller icon-smaller round light box-shadow hidden',
            click() {
              toggleAddToSelection(this);
            },
            state: addToSelection ? 'active' : 'initial',
            icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-8-2h2v-4h4v-2h-4V7h-2v4H7v2h4z"/></svg>',
            tooltipText: 'Lägg till i urval',
            tooltipPlacement: 'east'
          });
          buttons.push(addToSelectionButton);
        }

        if (showClearButton) {
          const clearButton = Origo.ui.Button({
            cls: 'o-multiselect-clear padding-small margin-bottom-smaller icon-smaller round light box-shadow hidden',
            click() {
              clearSelection();
            },
            icon: '#ic_delete_24px',
            tooltipText: 'Rensa',
            tooltipPlacement: 'east'
          });
          buttons.push(clearButton);
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
      featureInfo = viewer.getFeatureinfo();
      // source object to hold drawn features that mark an area to select features fromstyle
      // Draw Interaction does not need a layer, only a source is enough for it to work.
      selectSource = new Origo.ol.source.Vector();

      // Use default symbols or symbols from configuration
      bufferSymbol = options.bufferSymbol ? Origo.Style.createStyle({ style: options.bufferSymbol, viewer })() : Origo.Style.createStyleRule(defaultstyles.buffer);
      chooseSymbol = options.chooseSymbol ? Origo.Style.createStyle({ style: options.chooseSymbol, viewer })() : Origo.Style.createStyleRule(defaultstyles.choose);

      temporaryLayer = Origo.featurelayer(null, map);

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

      buttons.forEach((currButton) => {
        htmlString = currButton.render();
        el = dom.html(htmlString);
        document.getElementById(multiselectElement.getId()).appendChild(el);
      });

      this.dispatch('render');
    }
  });
};

export default Multiselect;
