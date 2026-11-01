import React, { useState } from "react";
import { useSelector } from "react-redux";
import { changeSelected } from "store/actions";
import { selectOddSpark } from "store/calculator/selector";
import { useDispatch } from "react-redux";
import SelectMaterialBlock from "./SelectMaterialBlock";
import { INIT_STATE } from "store/calculator/reducer";

const SelectMaterial = () => {
  const dispatch = useDispatch();
  const OddSpark = useSelector((state) => selectOddSpark(state));

  const selected = useSelector((state) => state.Calculator.selected);

  const [blocks, setBlocks] = useState(selected);

  const makeUnique = (_blocks) => {
    let retBlocks = [];
    _blocks.forEach((_b) => {
      let _existingBlock = retBlocks.find(
        (_eb) => _eb.material == _b.material
      );
      // add non-existing block
      if (!_existingBlock) {
        retBlocks.push(structuredClone(_b));
      } else {
        // update existing block to max workstations
        _existingBlock.numWorkstation = Math.max(
          _existingBlock.numWorkstation, _b.numWorkstation
        );
      }
    });
    return retBlocks;
  }

  const onChangeMaterial = (idx, material) => {
    let _blocks = [...blocks];
    _blocks[idx].material = material.id;
    _blocks[idx].numWorkstation = 1;
    setBlocks(_blocks);
    dispatch(changeSelected(makeUnique(_blocks)));
  }

  const onChangeNumWorkstation = (idx, nWstn) => {
    let _blocks = [...blocks];
    _blocks[idx].numWorkstation = nWstn;
    setBlocks(_blocks);

    dispatch(changeSelected(makeUnique(_blocks)));
  }

  const onAddBlock = () => {
    let _blocks = [
      ...blocks,
      ...structuredClone(INIT_STATE['selected'])
    ];
    setBlocks(_blocks);
    dispatch(changeSelected(makeUnique(_blocks)));
  }

  const onRemoveBlock = (idx) => {
    let _blocks = [...blocks];
    _blocks.splice(idx, 1);
    setBlocks(_blocks);
    dispatch(changeSelected(makeUnique(_blocks)));
  }
  return (<div style={{
    marginTop: "10px",
  }}>
    {blocks.map((_bl, idx) => {
      return (<SelectMaterialBlock
        key={idx}
        idx={idx}
        materialId={_bl.material}
        numWorkstation={_bl.numWorkstation}
        onChangeMaterial={onChangeMaterial}
        onChangeNumWorkstation={onChangeNumWorkstation}
        OddSpark={OddSpark}
        onAddBlock={onAddBlock}
        onRemoveBlock={onRemoveBlock}
      />);
    })}
    <SelectMaterialBlock
      idx={blocks.length}
      onAddBlock={onAddBlock}
    />
  </div>);
}

export default SelectMaterial;