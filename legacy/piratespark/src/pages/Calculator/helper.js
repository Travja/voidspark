import React from "react";
import { useSelector } from "react-redux";

export const formatFloat = (f) => {
  const ratePrecision = useSelector((state) => state.Calculator.ratePrecision);
  const divisor = Math.pow(10, ratePrecision);
  return Math.round(f * divisor) / divisor;
}

export const rateStr = () => {
  const rateDisplay = useSelector((state) => state.Calculator.rateDisplay);
  switch (rateDisplay.id) {
    case "ips":
      return "/ Sec";
    case "ipm":
      return "/ Min";
    case "iph":
      return "/ Hr";
  }
  return "";
}
//
//  tree: an array of nodes, array has a single node with depth = 0
//  i.e. tree[0].depth = 0, tree[i].depth > 0 for i > 0
//
//  trees: an array of trees
//  ?? i.e. trees[j][0].depth = 0 tree[j][i].depth > 0 for i > 0 
//
//  unitedtree: an array of nodes, array has multiple nodes with depth = 0 
//  unitedtree = trees.flat() 
//  disuniteTree(unitedtree) = trees
//  
export const disuniteTree = (tree) => {
  if(!tree || tree.length == 0 ) {
    return ;
  }
  let _trees = [];
  let _idx = [];
  tree.map((_node, idx) => {
    if(_node.depth == 0) {
      _idx.push(idx);
    }
  })
  tree.filter(_node => _node.depth == 0).map((_node, idxd0) => {
    let _ret = [];
    _ret.push(_node);
    tree.map((_node, idx) => {
      // substitute idxd0 == _idx.length - 1 for idx < _idx[idxd0 + 1]
      // <=
      // idx < _idx[idxd0 + 1] = _idx[_idx.length - 1 + 1] = _idx[_idx.length] is not well-defined
      if(idx > _idx[idxd0] && idxd0 == _idx.length - 1) {
        _ret.push(_node);
        return ;
      }
      if(idx > _idx[idxd0] && idx < _idx[idxd0 + 1]){
        _ret.push(_node);
      }
    })
    _trees.push(_ret);
  });
  return _trees;
}

export const plantCuttingsOfTree = (tree) => {
  let childUnitedTree = [];
  tree.filter(_node => _node.depth > 0).map(_node => {
    childUnitedTree.push(_node.copy(_node, {
      depth: _node.depth - 1,
    }))
  });

  return childUnitedTree;
}

export const sortWithDict = (a, b, dict) => {
  const a_idx = dict.findIndex((m) => m.id === a);
  const b_idx = dict.findIndex((m) => m.id === b);
  return a_idx - b_idx;
}
