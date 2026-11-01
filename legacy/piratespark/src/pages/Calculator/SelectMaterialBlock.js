import React from "react";
import ImageDrop from "./ImageDrop";
import FloatInput from "./FloatInput";
import { OddSparkEntityName } from "./Material";
import { Button } from "reactstrap";


const SelectMaterialBlock = ({
  idx: idx,
  materialId: materialId,
  numWorkstation: numWorkstation,
  onChangeMaterial: onChangeMaterial,
  onChangeNumWorkstation: onChangeNumWorkstation,
  OddSpark: OddSpark,
  onAddBlock: onAddBlock,
  onRemoveBlock: onRemoveBlock,
}) => {
  const onClickButton = () => {
    if (materialId) {
      onRemoveBlock(idx);
    } else {
      onAddBlock();
    }
  }
  const BlockInfo = () => {
    return <div style={{
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      width: "280px",
      marginRight: "auto",
    }}>

      <ImageDrop
        images={OddSpark.material}
        categories={OddSpark.category}
        renderImage={OddSpark.image}
        selectedImage={materialId}
        onSelectImage={(material) => onChangeMaterial(idx, material)}
        imagePerRow={4}
        size={70}
      />

      <div>
        <div>
          <b>[&nbsp;</b>
          <OddSparkEntityName
            id={materialId}
            textStyle={{
              fontWeight: "bold",
              fontSize: "1.2em",
            }}
          />
          <b>&nbsp;]</b>
        </div>
        <FloatInput
          id={idx}
          label="Workstations&nbsp;&nbsp;X&nbsp;&nbsp;"
          onBlur={(nWstn) => onChangeNumWorkstation(idx, nWstn)}
          initialVal={numWorkstation}
          maxVal={100}
        />
      </div>
    
    </div>;
  }
  return (<div style={{
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "360px",
    marginTop: "10px",
  }}>
    <Button
      outline
      style={{
        marginRight: "10px",
        width: "28px",
        height: "28px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "0px",
      }}
      onClick={() => onClickButton(idx)}
    >
      {materialId ? "x" : "+"}
    </Button>
    
    {materialId ? <BlockInfo /> : null}
    
  </div>);
}

export default SelectMaterialBlock;
