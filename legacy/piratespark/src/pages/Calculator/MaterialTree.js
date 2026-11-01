import React, { useContext } from "react";
import { plantCuttingsOfTree, disuniteTree } from "./helper";
import { List } from "reactstrap";
import { CalculateContext } from "./calculate";
import { useSelector } from "react-redux";
import { selectOddSpark } from "store/calculator/selector";
import MaterialTreeNode from "./MaterialTreeNode";

const MaterialTree = ({
  ...rest
}) => {
  const calc = useContext(CalculateContext);
  const selected = useSelector((state) => state.Calculator.selected);
  const OddSpark = useSelector((state) => selectOddSpark(state));
  
  const makeTrees = () => {
    // const aetherList = ['aether-shard'];
    // const regularMaterials = selected.filter(
    //   (_s) => !aetherList.includes(_s.material)
    // );

    // if (regularMaterials.length == 0) {
    //   return [];
    // }
    // const trees = calc.plantRootsSeperately({
    //   roots: regularMaterials,
    // });
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
  
  const CheckTree = ({
    tree: tree,
  }) => {
    if (!tree || tree.length == 0) {
      return <div />;
    }

    const ExpandTree = ({
      tree: tree
    }) => {
      if(tree.length == 0) {
        return <div />
      }
      const trees = disuniteTree(tree);
      return trees.map((_tree, idx) => {
        const parentNode = _tree[0];
        const childrenUnitedTree = plantCuttingsOfTree(_tree);
        // return <li key={_node.proc.id} style={{
        return <li key={idx} style={{
          paddingLeft: "30px",
        }}>
          <MaterialTreeNode node={parentNode} OddSpark={OddSpark} />
          {/*  _tree : tree of disunited tree */}
          {/* _tree[0] : parentnode
          seperateTrees(_tree)  */}
          <List type="unstyled">
            <ExpandTree tree={childrenUnitedTree} />
          </List>
        </li>;
      });
    }

    return <div>
        <List type="unstyled">
          <ExpandTree tree={tree} />
        </List>
      </div>
  }
  
  return (<div>
    {makeTrees().map((_tree, idx) => {
      return <CheckTree key={idx} tree={_tree} />;
    })}
  </div>);
}

export default MaterialTree;
