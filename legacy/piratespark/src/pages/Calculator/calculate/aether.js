import { expandNode } from "./chain";
import { Node, processTo } from "./proc";

const selectAetherProc = ({
  processes: processes,
  favoriteProcesses: favoriteProcesses,
  aetherSource: aetherSource,
}) => {
  const allAetherProcs = processTo({
    material: 'aether-shard',
    processes: processes,
    favoriteProcesses: favoriteProcesses,
  });
  switch(aetherSource) {
    // case 'aether-shard':
    //   return [];
    case 'aetheric-pellet':
      return allAetherProcs.find(
        _p => _p.from[0].material === 'aetheric-pellet'
      );
    case 'aetheric-clump':
      return allAetherProcs.find(
        _p => _p.from[0].material === 'aetheric-pellet'
      );
    case 'raw-aether':
      return allAetherProcs.find(
        _p => _p.from[0].material === 'raw-aether'
      );
    case 'refined-aether':
      return allAetherProcs.find(
        _p => _p.from[0].material === 'refined-aether'
      );
  }
}

export const makeAetherSampleTree = ({
  processes: processes,
  favoriteProcesses: favoriteProcesses,
  aetherSource: aetherSource,
  sparkSpeed: sparkSpeed,
  timeScale: timeScale
}) => {
  const ignoreMaterials = [];
  switch(aetherSource) {
    case 'aether-shard':
      ignoreMaterials.push('raw-aether', 'refined-aether', 'aether-shard');
      ignoreMaterials.push('aetheric-pellet', 'aetheric-clump');
      break;

   case 'aetheric-pellet':
      ignoreMaterials.push('aetheric-pellet', 'aetheric-clump');
      break;
  }
  if(aetherSource == 'aether-shard'){
    return [];
  }
  
  const aetherProc = selectAetherProc({
    processes: processes,
    favoriteProcesses: favoriteProcesses,
    aetherSource: aetherSource,
  });
  return expandNode({
    currNode: new Node({
      proc: aetherProc,
      material: 'aether-shard',
      depth: 0,
      nWstn: 1,
      timeScale: timeScale,
    }),
    processes: processes,
    favoriteProcesses: favoriteProcesses,
    sparkSpeed: sparkSpeed,
    timeScale: timeScale,
    stopAtShard: false,
    ignoreMaterials: [...ignoreMaterials, 'aether-shard'],
  })
}


export const appendAetherNode = ({
  tree: tree,
  aetherTree: aetherTree,
  sparkSpeed: sparkSpeed,
  timeScale: timeScale,
}) => {
  if(tree.length == 0) {
    return [];
  }
  if(aetherTree.length == 0 || tree[0].material == 'aether-shard') {
    let _ret = [];
    tree.map(_tn => {
      _ret.push(_tn.copy(_tn, {
        isAT: true
      }));
    });
    return _ret;
  }
  
  // consider C: consumption of aether-shard will be regarded as loss of production of aether-shard
  // in aetherTree = makeAetherSampleTree()
  let C = 0;
  aetherTree.map(_an => {
    _an.proc.from.map(_f => {
      if(_f.material == 'aether-shard') {
        C = _f.amount * _an.nWstn / _an.proc.buildTime;
      }
    })
  })

  let _ret = [];
  const P = aetherTree[0].proc.to[0].amount * aetherTree[0].nWstn / aetherTree[0].proc.buildTime;
  // production of aether-shard

  tree.map(_tn => {
    _ret.push(_tn.copy(_tn, {
      isAT: true
    }));
    _tn.proc.from.map(_f => {
      if(_f.material != 'aether-shard') {
        return [];
      }
      if(_tn.nWstn == 0) {
        return [];
      }
      // 0nWstn 

      aetherTree.map(_an => {
        const adjustedNWstn = _an.nWstn * _f.amount * _tn.nWstn / _tn.proc.buildTime / (P - C);
        // _f.amount * _tn.nWstn / _tn.proc.buildTime: consumption in tree node
        // (P-C) * adjustedNWstn /_an.nWstn: adjusted production in aether tree(branch of appendedTree)
        // P: aether production per second
        // C: loss of production per second
        // scale all aether production by adjustedNWstn
        _ret.push(_an.copy(_an, {
          depth: _an.depth + _tn.depth + 1,
          nWstn: adjustedNWstn,
          rate: 60 * 2 * sparkSpeed * timeScale * adjustedNWstn / _an.proc.buildTime,
          isAT: true,
        }));
      });
    });
  });

  return _ret;
}