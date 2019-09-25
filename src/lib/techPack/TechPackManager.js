/* eslint-disable require-jsdoc */
import * as THREE from '@/lib/threejs/three';
import {Marker, makeTextSprite} from '@/lib/marker/Marker';

const pointerScaleVector = new THREE.Vector3();
const pointerScaleFactor = 65;

class TechPackManager {
  constructor({scene, camera, renderer, controls}) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;

    this.markerMap = new Map();
    this.markerGeometryList = [];
    this.styleLineMap = new Map();

    this.raycaster = new THREE.Raycaster();

    this.loadTechPackFromMatMeshList = this.loadTechPackFromMatShapeList.bind(this);
    this.addPatternMarker = this.addPatternMarker.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.refreshMarkerGeometryList = this.refreshMarkerGeometryList.bind(this);
    this.checkIntersectObject = this.checkIntersectObject.bind(this);
  }

  loadTechPackFromMatShapeList(matShapeList) {
    if (!matShapeList) {
      return;
    }

    this.markerMap.clear();

    //  NOTE: All elements in mapShape array have the same value.
    //  This module will be modified by TKAY and Daniel.
    for (let i = 0; i < matShapeList.length; ++i) {
      const mapShape = matShapeList[i].get('listMatMeshIDOnIndexedMesh');
      const center = mapShape[0].get('v3Center');
      const normal = mapShape[0].get('v3Normal');

      if (!center || !normal) {
        continue;
      }

      const position = {
        pointerPos: center,
        faceNormal: normal,
        cameraPos: this.camera.position,
        cameraTarget: this.controls.target,
        cameraQuaternion: this.camera.quaternion,
      };

      const index = i + 1;
      this.addPatternMarker(index, {...position, message: index}, false);
    }

    this.loadStyleLineFromMatShapeList(matShapeList);
  }

  bindEventListener({onCompleteMove, onCompleteAnimation}) {
    this.onCompleteMove = onCompleteMove;
    this.onCompleteAnimation = onCompleteAnimation;
  }

  updatePointerSize() {
    this.markerMap.forEach( (marker) => {
      const scale = pointerScaleVector.subVectors(marker.sprite.position, this.camera.position).length() / pointerScaleFactor;
      marker.sprite.scale.set(scale / 2, scale / 2, 1);
    });
  }

  refreshMarkerGeometryList() {
    this.markerGeometryList = [];

    // NOTE: Index of a marker begins at 1
    for (let i = 0; i < this.markerMap.size; i++) {
      const marker = this.markerMap.get(i + 1).sprite;
      this.markerGeometryList.push(marker);
    }
  }

  addPatternMarker(index, {pointerPos, faceNormal, cameraPos, cameraTarget, cameraQuaternion, message}, isVisible = true) {
    // pointer 좌표만 들고있다가 render 할때마다 만드는건 개 비효율이겠지? 그냥 그때 그때 계속 추가하자.
    const sprite = makeTextSprite(message,
        {fontsize: 48, borderColor: {r: 255, g: 255, b: 255, a: 0.5}, backgroundColor: {r: 0, g: 0, b: 0, a: 0.5}});
    sprite.position.set(pointerPos.x, pointerPos.y, pointerPos.z);
    sprite.visible = isVisible;

    this.scene.add(sprite);

    // NOTE: A message of a marker replaced with a index.
    const marker = new Marker(pointerPos, faceNormal, cameraPos, cameraTarget, cameraQuaternion, index, sprite);
    this.markerMap.set(index, marker);

    this.refreshMarkerGeometryList();

    return sprite.id;
  }

  setMarkerVisible(index, bVisible) {
    if (!this.markerMap.get(index).sprite.visible) {
      return;
    }

    this.markerMap.get(index).sprite.visible = bVisible;
  }

  setAllMarkerVisible(bVisible) {
    this.markerMap.forEach( (marker) => {
      if (!marker.sprite) {
        return;
      }
      marker.sprite.visible = bVisible;
    });
  }

  setPatternVisible(patternIdx, matMeshList, bVisible) {
    patternIdx *= 3;

    for (let i = patternIdx; i < patternIdx + 3; ++i) {
      matMeshList[i].visible = bVisible;
    }
  }

  setAllPatternVisible(matMeshList, bVisible) {
    for (let i = 0; i < matMeshList.length; ++i) {
      matMeshList[i].visible = bVisible;
    }
  }

  loadStyleLineFromMatShapeList(matShapeList) {
    console.log(matShapeList);
  }


  addStyleLinesToScene(scene, styleLineMap, bVisible = true) {
    styleLineMap.forEach((styleLineSet) => {
      styleLineSet.forEach((line) => {
        line.visible = bVisible;
        scene.add(line);
      });
    });
  }

  setStyleLineVisible(styleLineMap, index, bVisible) {
    styleLineMap.get(index).forEach((line) => {
      line.visible = bVisible;
    });
  }

  // viewer에서 canvas 클릭시 실행
  onMouseDown(e, action) {
    this.mouseButtonDown = true;
    const item = this.checkIntersectObject(e);
    if (item) {
      this.pickedMarker = item;
      this.isMouseMoved = false;
      console.log(item);
      return item;
    }
  }

  onMouseMove(e) {
    // FIXME: This function does nothing
  }

  checkIntersectObject({clientX, clientY}) {
    if (this.markerMap.length <= 0) {
      return;
    }
    const mouse = this.getMousePosition({clientX, clientY});
    this.raycaster.setFromCamera(mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.markerGeometryList, true);

    if (intersects.length > 0) {
      // 처리할거 하고 return;
      for (let i = 1; i <= this.markerMap.size; ++i) {
        const marker = this.markerMap.get(i);
        if (intersects[0].object === marker.sprite) {
          return marker;
        }
      }
    }
  }

  getMousePosition({clientX, clientY}) {
    const canvasBounds = this.renderer.context.canvas.getBoundingClientRect();
    const x = ((clientX - canvasBounds.left) / (canvasBounds.right - canvasBounds.left)) * 2 - 1;
    const y = -((clientY - canvasBounds.top) / (canvasBounds.bottom - canvasBounds.top)) * 2 + 1;

    return {x, y};
  }
}

export default TechPackManager;
