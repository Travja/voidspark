import { expandNode } from "./chain"
import { Node, processTo } from "./proc"

export const uniteFuelTree = ({
  processes: processes,
  favoriteProcesses: favoriteProcesses,
  fuel: fuel,
  tree: tree,
  sparkSpeed: sparkSpeed,
  timeScale: timeScale
}) => {
  if(tree.length == 0) {
    return [];
  }
  if(tree[0].material == fuel.id) {
    let _ret = [];
    tree.map(_tn => {
      _ret.push(_tn.copy(_tn, {
        isRootFuel: true,
        isUT: true,
        timeScale: timeScale
      }));
    });
    return _ret;
  }
  const _prevProc = (_material) => {
    return processTo({
      material: _material,
      processes: processes,
      favoriteProcesses: favoriteProcesses,
    })[0];
  };

  const fuelNode = new Node({
    proc: _prevProc(fuel.id),
    material: fuel.id,
    depth: 0,
    nWstn: 0,
    fpuInT: 0,
    fpuinFT: 0,
  });

  // count fuel for each node in tree
  tree.map(_tn => {
    if(_tn.proc.fuelRequired) {
      fuelNode.add({
        fpuInT: timeScale * fuel.amount * _tn.nWstn,
        nWstn: fuel.amount * _tn.nWstn * _prevProc(fuel.id).buildTime / (60 * 2 * sparkSpeed * _prevProc(fuel.id).to[0].amount),
      });
    }
  })

  if(fuelNode.fpuInT == 0){
    let _ret = [];
    tree.map(_tn => {
      _ret.push(_tn.copy(_tn, {
        isUT: true,
        timeScale: timeScale
      }));
    });
    return _ret;
  }

  let fuelTree = expandNode({
    currNode: fuelNode,
    processes: processes,
    favoriteProcesses: favoriteProcesses,
    sparkSpeed: sparkSpeed,
    timeScale: timeScale
  });

 
  fuelTree.map(_ftn => {
    if(_ftn.proc.fuelRequired) {
      fuelNode.add({
        fpuinFT: timeScale * fuel.amount * _ftn.nWstn,
      });
    }
  })

  // case1 zero coal in Tree => no recursion && no fuel needed in FT
  // wooden log consumption(as fuel) in FT need not to change
  if (fuel.id != 'coal') {
    fuelNode.adjustedNWstn = fuelNode.nWstn;
  }
  // case2 nonzero coal && fuel.id == coal => consider recursion
  // consider M: multipler due to recursion
  else {
    const M = fuelNode.fpuInT / (fuelNode.fpuInT - fuelNode.fpuinFT);
    fuelNode.adjustedNWstn = M * fuelNode.nWstn
  }

  // rescale fuelTree with adjustedNWstn
  const _fuelNode = new Node({
    proc: _prevProc(fuelNode.material),
    material: fuelNode.material,
    depth: 0,
    nWstn: fuelNode.adjustedNWstn,
  });

  const fuelTreeAfterRescale = expandNode({
    currNode: _fuelNode,
    processes: processes,
    favoriteProcesses: favoriteProcesses,
    sparkSpeed: sparkSpeed,
    timeScale: timeScale
  });

  let _ret = [];
  tree.map(_tn => {
    _ret.push(_tn.copy(_tn, {
      isUT: true,
      timeScale: timeScale
    }));
  });
  
  fuelTreeAfterRescale.map(_ftn => {
      _ret.push(_ftn.copy(_ftn, {
        isRootShard: (tree[0].material == 'aether-shard'),
        isFN: true,
        isUT: true,
        timeScale: timeScale
      }));
  });

  _ret.map(_ftn => {
    _ftn.isRootOfFT = (_ftn.isFN && _ftn.depth == 0);
  })

  return _ret;
}