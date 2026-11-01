import React, { useContext } from "react";
import MaterialRow from "./MaterialRow";
import { Table } from "reactstrap";
import { useSelector } from "react-redux";
import { rateStr } from "./helper";
import { CalculateContext } from "./calculate";

const MaterialTable = (props) => {
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
    // append : calculate aether-shard tree then exchange aether-shard node in tree for it
    // unite : calculate all fuels needed and make tree then combine with tree 
    return unitedTrees;
  }
  
  let { byMaterial, allMaterials } = calc.accumulate({
    Trees: makeTrees(),
  })
  return (<div>
    <Table>
      <thead>
        <tr>
          <th style={{ width: 50 }} />
          <th style={{ width: 150 }}>
            Item
          </th>
          <th style={{
            width: 100,
            textAlign: "right",
          }}>
            Items&nbsp;{rateStr()}
          </th>
          <th style={{ width: 50 }} />
          {/* workstations icon */}
          <th style={{
            width: 100,
            textAlign: "right",
          }}>
            Workstation
          </th>
          <th style={{
            width: 100,
            textAlign: "right",
          }}>
            Workstations
          </th>
          <th style={{
            width: 50,
            textAlign: "right",
          }}>
            %
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        {allMaterials.map((_material, idx) => {
          return <React.Fragment key={_material}>
            <MaterialRow node={byMaterial[_material]} idx={idx} />
          </React.Fragment>;
        })}
      </tbody>
    </Table>
  </div>);
}

export default MaterialTable;
