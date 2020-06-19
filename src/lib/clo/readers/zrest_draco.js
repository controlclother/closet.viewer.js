import { readByteArray } from "@/lib/clo/file/KeyValueMapReader";
import { unZip } from "@/lib/clo/readers/FileLoader";
import * as THREE from "@/lib/threejs/three";
import { makeMaterial } from "@/lib/clo/readers/zrest_material";
import { MATMESH_TYPE } from "@/lib/clo/readers/predefined";

const getDracoGeometry = async (
  matMeshManager,
  qsDracoFileName,
  JSZipOrDracoData
) => {
  // Draco Compression
  const dracoMeshFilename = readByteArray("String", qsDracoFileName);
  if (!dracoMeshFilename) {
    console.error("cannot find draco Mesh");
    return false;
  }

  const getFromMapDracoData = async () => {
    // TODO: This is really dangerous code!
    // const order = dracoMeshFilename.replace("drc", "").replace(".", "");
    // console.log(order);
    // console.log(JSZipOrDracoData);
    // console.log(dracoMeshFilename);

    return JSZipOrDracoData.get(dracoMeshFilename);
  };

  const getFromJSZip = async () => {
    const drcArrayBuffer = await JSZipOrDracoData.file(dracoMeshFilename).async(
      "arrayBuffer"
    );

    return drcArrayBuffer;
  };

  // console.log(this.zProperty.bDisassembled);
  const drcArrayBuffer = matMeshManager.zProperty.bDisassembled
    ? await getFromMapDracoData()
    : await getFromJSZip();

  const dracoLoader = new THREE.DRACOLoader();

  return dracoLoader.decodeDracoFile(drcArrayBuffer);
};

const buildStyleLines = (
  matMeshManager,
  dracoGeometry,
  patternIdx,
  listLine,
  frontVertexCount
) => {
  if (!listLine) {
    return;
  }

  const styleLineMaterial = new THREE.LineBasicMaterial({
    color: 0xfffe00,
  });
  const currentStyleLineSet = new Set();

  for (let k = 0; k < listLine.length; ++k) {
    const frontStyleLineGeometry = new THREE.Geometry();
    const backStyleLineGeometry = new THREE.Geometry();

    const listMeshPointIndex = listLine[k].get("listMeshPointIndex");
    if (listMeshPointIndex !== undefined && listMeshPointIndex !== null) {
      for (let h = 0; h < listMeshPointIndex.length; ++h) {
        let vIndex = listMeshPointIndex[h].get("uiMeshPointIndex");
        if (vIndex !== undefined && vIndex !== null) {
          const frontStyleLinePos = new THREE.Vector3();
          frontStyleLinePos.x = dracoGeometry.vertices[vIndex * 3];
          frontStyleLinePos.y = dracoGeometry.vertices[vIndex * 3 + 1];
          frontStyleLinePos.z = dracoGeometry.vertices[vIndex * 3 + 2];
          frontStyleLineGeometry.vertices.push(frontStyleLinePos);

          const backStyleLinePos = new THREE.Vector3();
          vIndex += frontVertexCount;
          backStyleLinePos.x = dracoGeometry.vertices[vIndex * 3];
          backStyleLinePos.y = dracoGeometry.vertices[vIndex * 3 + 1];
          backStyleLinePos.z = dracoGeometry.vertices[vIndex * 3 + 2];
        }
      }

      frontStyleLineGeometry.computeFaceNormals();
      frontStyleLineGeometry.computeVertexNormals();
      const frontStyleLine = new THREE.Line(
        frontStyleLineGeometry,
        styleLineMaterial
      );
      currentStyleLineSet.add(frontStyleLine);

      backStyleLineGeometry.computeFaceNormals();
      backStyleLineGeometry.computeVertexNormals();
      const backStyleLine = new THREE.Line(
        backStyleLineGeometry,
        styleLineMaterial
      );
      currentStyleLineSet.add(backStyleLine);
    }

    matMeshManager.styleLineMap.set(patternIdx, currentStyleLineSet);
  }
};

// TODO: Do refactor more!
// TODO: Is this the appropriate function name??
const splitMatSpaceToMatMesh = async (
  matMeshManager,
  listMatMeshIDOnIndexedMesh,
  totalIdxCount,
  listIdxCount,
  dracoGeometry,
  bVisible,
  frontVertexCount,
  JSZipOrDracoData,
  tf,
  bLoadTransparentObject,
  materialInformationMap
) => {
  const zrestVersion = matMeshManager.zProperty.version;
  let indexOffset = zrestVersion > 4 ? 0 : totalIdxCount;
  for (let m = 0; m < listIdxCount.length; ++m) {
    if (zrestVersion <= 4) {
      indexOffset = indexOffset - listIdxCount[m];
    }
    /**
     * NOTE:
     * to Rayn 왜 이렇게 index 를 거꾸로 해야 제대로 렌더링되는지 원인을 모르겠음.
     * 일단 이렇게 해서 되는 것 같지만 찜찜..
     * Jaden 2017.06.25
     */
    const matMeshID = listMatMeshIDOnIndexedMesh[m].get("uiMatMeshID");
    const matProperty = materialInformationMap.get(matMeshID);
    const indexSize = listIdxCount[m];

    /**
     * NOTE:
     * 이제는 bPerfectTransparent 해도 무조건 그린다.
     * colorway 중 하나만 perfect transparent했을 때 mesh 안그리게 하면 perfect transparent 하지 않는 colorway 로 바꿨을 때도 아예 안그려지는 버그 발생.
     */

    // TODO: refactor this
    const bTransparent =
      matProperty.colorwayMaterials[matMeshManager.colorwayIndex].bTransparent;

    // TODO: TEMP; 투명, 불투명 처리하려면 이 부분을 잘 건드려야 한다
    if (bLoadTransparentObject) {
      if (!bTransparent) {
        if (zrestVersion > 4) {
          indexOffset += indexSize;
        }
        continue;
      }
    } else {
      if (bTransparent) {
        if (zrestVersion > 4) {
          indexOffset += indexSize;
        }
        continue;
      }
    }

    /**
     * NOTE:
     * THREE.Geometry 를 사용하면 실제 메쉬의 메모리보다 10배 가까운 메모리를 사용하게 된다.
     * 왜 그정도인지는 모르겠지만.. 그래서 BufferGeometry 사용한다.
     * Jaden 2017.06.08
     */
    const bufferGeometry = new THREE.BufferGeometry();

    /**
     * NOTE:
     * dracoGeometry의 해당 mesh에 의해 사용된 vertex들로만 새로운 메쉬를 만들기 위해 changeVertexIndex 만든다.
     * 값은 새로운 메쉬에서의 vertexIndex. 초기값은 -1.
     */
    const changeVertexIndex = new Int32Array(dracoGeometry.vertices.length / 3);

    // console.log(dracoGeometry.vertices.length);

    for (let j = 0; j < dracoGeometry.vertices.length / 3; j++) {
      changeVertexIndex[j] = -1;
    }

    // console.log("changeVertexIndex done");

    const posAttrib = [];
    const normalAttrib = [];
    const uvAttrib = [];
    const uv2Attrib = [];

    let count = 0;

    for (let j = 0; j < indexSize; j++) {
      const index = dracoGeometry.indices[indexOffset + j];
      if (changeVertexIndex[index] === -1) {
        // 방문되지 않은 녀석들만 새로운 mesh vertex 로 추가한다.
        changeVertexIndex[index] = count;
        count++;

        const threePos = new THREE.Vector3(
          dracoGeometry.vertices[index * 3],
          dracoGeometry.vertices[index * 3 + 1],
          dracoGeometry.vertices[index * 3 + 2]
        );
        // threePos.applyMatrix4(m4);

        posAttrib.push(threePos.x);
        posAttrib.push(threePos.y);
        posAttrib.push(threePos.z);

        if (dracoGeometry.useNormal) {
          normalAttrib.push(dracoGeometry.normals[index * 3]);
          normalAttrib.push(dracoGeometry.normals[index * 3 + 1]);
          normalAttrib.push(dracoGeometry.normals[index * 3 + 2]);
        }

        uvAttrib.push(dracoGeometry.uvs[index * 2]);
        uvAttrib.push(dracoGeometry.uvs[index * 2 + 1]);

        if (dracoGeometry.numUVs >= 2) {
          uv2Attrib.push(dracoGeometry.uv2s[index * 2]);
          uv2Attrib.push(dracoGeometry.uv2s[index * 2 + 1]);
        }
      }
    }

    // console.log("index loop done");

    if (m === 0) {
      frontVertexCount = count;
    }

    bufferGeometry.addAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(posAttrib), 3)
    );

    if (dracoGeometry.useNormal) {
      bufferGeometry.addAttribute(
        "normal",
        new THREE.BufferAttribute(new Float32Array(normalAttrib), 3)
      );
    }

    bufferGeometry.addAttribute(
      "uv",
      new THREE.BufferAttribute(new Float32Array(uvAttrib), 2)
    );
    if (dracoGeometry.numUVs >= 2) {
      bufferGeometry.addAttribute(
        "uv2",
        new THREE.BufferAttribute(new Float32Array(uv2Attrib), 2)
      );
    }

    // Set Indices
    const indexAttrib = [];

    if (zrestVersion > 4) {
      for (let k = 0; k < indexSize; k++) {
        const index = dracoGeometry.indices[indexOffset + k];
        indexAttrib.push(changeVertexIndex[index]);
      }

      indexOffset += indexSize;
    } else {
      for (let j = indexSize / 3 - 1; j >= 0; j--) {
        indexAttrib.push(
          changeVertexIndex[dracoGeometry.indices[indexOffset + j * 3]]
        );
        indexAttrib.push(
          changeVertexIndex[dracoGeometry.indices[indexOffset + j * 3 + 1]]
        );
        indexAttrib.push(
          changeVertexIndex[dracoGeometry.indices[indexOffset + j * 3 + 2]]
        );
      }
    }

    bufferGeometry.setIndex(
      new THREE.BufferAttribute(new Uint32Array(indexAttrib), 1)
    );

    if (!dracoGeometry.useNormal) {
      bufferGeometry.computeFaceNormals();
      bufferGeometry.computeVertexNormals();
    }

    const bUseSeamPuckeringNormalMap = dracoGeometry.numUVs >= 2;

    const material = await makeMaterial({
      jsZip: JSZipOrDracoData,
      matProperty: matProperty,
      zProperty: matMeshManager.zProperty,
      matMeshID: matMeshID,
      bUseSeamPuckeringNormalMap: bUseSeamPuckeringNormalMap,
    });

    if (material === "undefined") {
      console.error("material(" + matMeshID + ") undefined!");
      return;
    }

    const threeMesh = new THREE.Mesh(bufferGeometry, material);
    const matMeshType = listMatMeshIDOnIndexedMesh[m].get("enType");
    // 여기서 center, normal, bounding sphere radius,

    // TODO: OMG, please refactor here
    let type = MATMESH_TYPE.PATTERN_MATMESH;
    if (MATMESH_TYPE !== undefined || MATMESH_TYPE !== null) {
      if (MATMESH_TYPE === 0) {
        type = MATMESH_TYPE.PATTERN_MATMESH;
      } else if (matMeshType === 1) {
        type = MATMESH_TYPE.TRIM_MATMESH;
      } else if (matMeshType === 2) {
        type = MATMESH_TYPE.PRINTOVERLAY_MATMESH;
      } else if (matMeshType === 3) {
        type = MATMESH_TYPE.BUTTONHEAD_MATMESH;
      } else if (matMeshType === 4) {
        type = MATMESH_TYPE.NORMAL_MATMESH;
      } else if (matMeshType === 5) {
        type = MATMESH_TYPE.AVATAR_MATMESH;
      } else if (matMeshType === 6) {
        type = MATMESH_TYPE.STITCH_MATMESH;
      } else if (matMeshType === 7) {
        type = MATMESH_TYPE.BUTTONHOLE_MATMESH;
      }
    }

    const center = new THREE.Vector3(-1, -1, -1);
    const normal = new THREE.Vector3(-1, -1, -1);
    const boundingSphereRadius = 0.0;

    // 여기도 version 가지고 나누는게 나을까? center랑 이런거 데이터가 없을텐데.
    threeMesh.userData = {
      SELECTED: false,
      MATMESH_ID: matMeshID,
      TYPE: type,
      CENTER: center,
      NORMAL: normal,
      BOUNDING_SPHERE_RADIUS: boundingSphereRadius,
    };

    if (zrestVersion >= 4) {
      if (bVisible === undefined || bVisible === null) {
        threeMesh.visible = true;
      } else {
        threeMesh.visible = bVisible;
        // if (bVisible === 0) {
        //   threeMesh.visible = false;
        // } else if (bVisible === 1) {
        //   threeMesh.visible = true;
        // }
      }
    } else {
      threeMesh.visible = true;
    }

    let b = true;
    if (material.uniforms.materialOpacity.value === 0) {
      b = false;
    }

    threeMesh.castShadow = b;
    threeMesh.receiveShadow = b;
    tf.add(threeMesh);

    // TEST for fitting
    if (type === MATMESH_TYPE.PATTERN_MATMESH) {
      console.log(dracoGeometry);
      threeMesh.userData.originalIndices = dracoGeometry.indices;
      threeMesh.userData.originalUv = dracoGeometry.uvs;
      threeMesh.userData.originalUv2 = dracoGeometry.uv2s;
      // matMeshManager.mapMatMeshIndex.set(matMeshID, dracoGeometry.indices);
    }

    matMeshManager.matMeshMap.set(matMeshID, threeMesh);

    if (zrestVersion > 4) {
      // marker 만들자.
      const cameraPos = new THREE.Vector3();
      cameraPos.copy(center);

      const distanceVector = new THREE.Vector3();
      distanceVector.copy(normal);
      distanceVector.normalize();

      distanceVector.multiplyScalar(boundingSphereRadius * 13);

      cameraPos.add(distanceVector);
    }
  }
};

export const getAllDracoGeometry = async ({
  matMeshManager,
  listMatShape,
  JSZipOrDracoData,
}) => {
  const newListMatShape = listMatShape.map(async (matShape) => {
    const mapShape = matShape.get("mapShape");
    if (!mapShape) {
      console.error("mapShape is null");
      return false;
    }
    const dracoFilename =
      mapShape.get("qsDracoFileNameUTF8") || mapShape.get("qsDracoFileName");
    return await getDracoGeometry(
      matMeshManager,
      dracoFilename,
      JSZipOrDracoData
    );
  });
  return await Promise.all(newListMatShape);
};

export const createMatMesh = async (
  matMeshManager,
  listMatShape,
  JSZipOrDracoData,
  tf,
  bLoadTransparentObject,
  materialInformationMap
) => {
  let frontVertexCount = 0;

  const newListMatShape = listMatShape.map(async (item) => {
    const matShape = item;
    const listMatMeshIDOnIndexedMesh = matShape.get(
      "listMatMeshIDOnIndexedMesh"
    );

    const mapShape = matShape.get("mapShape");
    if (!mapShape) {
      console.error("mapShape is null");
      return false;
    }

    const listIndexCount = mapShape.get("listIndexCount");
    if (!listIndexCount || listIndexCount.length === 0) {
      console.error("listIndexCount is null");
      return false;
    }

    // TODO: Refactor this module
    let totalIndexCount = 0;
    for (let m = 0; m < listIndexCount.length; ++m) {
      totalIndexCount += listIndexCount[m];
    }

    const dracoFilename =
      mapShape.get("qsDracoFileNameUTF8") || mapShape.get("qsDracoFileName");

    // console.log(readByteArray("String", dracoFilename));

    const dracoGeometry = await getDracoGeometry(
      matMeshManager,
      dracoFilename,
      JSZipOrDracoData
    );
    // console.log("dragoGeometry done");

    const bVisiable = matShape.get("bMatShapeVisible") || false;

    await splitMatSpaceToMatMesh(
      matMeshManager,
      listMatMeshIDOnIndexedMesh,
      totalIndexCount,
      listIndexCount,
      dracoGeometry,
      bVisiable,
      frontVertexCount,
      JSZipOrDracoData,
      tf,
      bLoadTransparentObject,
      materialInformationMap
    );

    const listLine = matShape.get("listLine");
    const firstMatMeshID = listMatMeshIDOnIndexedMesh[0].get("uiMatMeshID");

    if (listLine) {
      buildStyleLines(
        matMeshManager,
        dracoGeometry,
        firstMatMeshID,
        listLine,
        frontVertexCount
      );
    }
  });

  await Promise.all(newListMatShape);
};
