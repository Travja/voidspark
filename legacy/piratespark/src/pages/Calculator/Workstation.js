import React, { useContext } from "react";
import { useSelector } from "react-redux";
import { CalculateContext } from "./calculate";
import { OddSparkEntityName, OddSparkImage } from "./Material";

const Workstation = () => {
  const calc = useContext(CalculateContext);
  const selected = useSelector((state) => state.Calculator.selected);
  const makeTrees = () => {
    const trees = calc.plantRootsSeperately({
      roots: selected,
    });

    const appendedTrees = trees.map(
      _ct => calc.appendAetherNode({ tree: _ct })
    );

    const miasmaAppendedTrees = appendedTrees.map(
      _bt => calc.appendMiasmaNode({ tree: _bt })
    );
  
    const unitedTrees = miasmaAppendedTrees.map(
      _at => calc.uniteFuelTree({ tree: _at })
    );

    return unitedTrees;
  }
  
  let { byWstn, allWstns, byWstnMaterial, allWstnMaterials } = calc.accumulate({
    Trees: makeTrees(),
  })

  return <div style={{
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "flex-start",
  }}>
    <h6>Workstations needed</h6>
    <p>* Rounded up</p>
    <div style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      alignItems: "flex-start",
    }}>
      {allWstns.map(_wstn => {
        return <div key={_wstn}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 8,
          }}>
            <div>
              {byWstn[_wstn].total}&nbsp;X&nbsp;&nbsp;
            </div>
            <OddSparkImage
              id={_wstn}
              size={25}
              type="workstation"
              withPopover={true}
            />
            <OddSparkEntityName
              id={_wstn}
              type={"workstation"}
              textStyle={{
                marginLeft: 8,
              }}
            />
        </div>
      })}
    </div>

    <hr style={{ maxWidth: "600", width: "100%" }} />
    <h6>Materials needed</h6>
    <div style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      alignItems: "flex-start",
    }}>
      {allWstnMaterials.map(_wstnMaterial => {
        return <div key={_wstnMaterial}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            marginTop: 8,
          }}>
            <div>
              {byWstnMaterial[_wstnMaterial].total}&nbsp;X&nbsp;&nbsp;
            </div>
            <OddSparkImage
              id={_wstnMaterial}
              size={25}
              withPopover={true}
            />
            <OddSparkEntityName
              id={_wstnMaterial}
              textStyle={{
                marginLeft: 8,
              }}
            />
        </div>
      })}
    </div>
  </div>
}

export default Workstation;
