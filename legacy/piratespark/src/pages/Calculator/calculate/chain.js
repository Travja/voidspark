import { Node, Process, processTo, NodeSetAccumulate } from "./proc";
import { makeAetherSampleTree } from "./aether";
import { makeMiasmaSampleTree } from "./miasma";

export const expandNode = ({
  currNode: currNode,
  processes: processes,
  favoriteProcesses: favoriteProcesses,
  sparkSpeed: sparkSpeed,
  timeScale: timeScale,
  stopAtShard: stopAtShard=true,
  stopAtMiasma: stopAtMiasma=true,
  ignoreMaterials: ignoreMaterials=['aether-shard'],
}) => {
  // return nil for null or node with no process
  if(!currNode || !currNode.proc) {
    return [];
  }

  const _currNode = currNode.copy(currNode, {
    rate: 60 * 2 * sparkSpeed * timeScale * currNode.nWstn / currNode.proc.buildTime,
  });
  
  let _ret = [_currNode];

  // return identity node of which ingredient doesn't exist 
  if(currNode.proc.from.length == 0) {
    return _ret;
  }

  // concatenate currNode with its childNode
  _ret = _ret.concat(
    currNode.proc.from.flatMap(_f => {
      // cases not to caculate ChildNode
      if(ignoreMaterials.includes(_f.material)) {
        return [];
      }
      if(stopAtShard && (currNode.material == 'aether-shard')) {
        return [];
      }
      if(stopAtMiasma && (_f.material == 'miasma-vial')) {
        return [];
      }
      if(currNode.nWstn == 0){
        return [];
      }
      // 0nWstn
      // hide subprocesses for 0nWstn in tree

      const _childProc = processTo({
        material: _f.material,
        processes: processes,
        favoriteProcesses: favoriteProcesses,
      })[0];

      const _wstnScale = _childProc ? (_childProc.to[0].amount / _childProc.buildTime) : 1;
      const _childNWstn = _childProc ? currNode.nWstn * (_f.amount / currNode.proc.buildTime) / _wstnScale : 0;

      const childNode = new Node({
        proc: _childProc,
        material: _f.material,
        depth: currNode.depth + 1,
        nWstn: _childNWstn,
      });
      return expandNode({
        currNode: childNode,
        processes: processes,
        favoriteProcesses: favoriteProcesses,
        sparkSpeed: sparkSpeed,
        timeScale: timeScale,
        stopAtShard: stopAtShard,
        stopAtMiasma: stopAtMiasma,
        ignoreMaterials: ignoreMaterials,
      });
  }));
  return _ret;
}

export const plantRootsSeperately = ({
  roots: roots,
  processes: processes,
  favoriteProcesses: favoriteProcesses,
  fuel: fuel,
  sparkSpeed: sparkSpeed,
  timeScale: timeScale,
  aetherSource: aetherSource
}) => {
  const _rootNodes = roots.map(_root => {
    const rootProcs = () => {
      if(_root.material === 'aether-shard'){
        return [];
      }
      return processTo({
        material: _root.material,
        processes: processes,
        favoriteProcesses: favoriteProcesses,
        isRootProcess: true,
      });
    };
    return new Node({
      proc: rootProcs()[0],
      material: _root.material,
      isRootShard: (_root.material == 'aether-shard'),
      isRootFuel: (_root.material == fuel),
      depth: 0,
      nWstn: _root.numWorkstation,
      timeScale: timeScale,
    });
  });

  // expand nodes
  const _expandRootNode = _rootNodes.map((_rootNode) => {
    
    if(_rootNode.material == 'aether-shard') {
      // return nil for aether-shard = root = aetherSource 
      if(aetherSource.includes(_rootNode.material)) {
        return [];
      }
      let _ret = [];
      let aetherTree = makeAetherSampleTree({
        processes: processes,
        favoriteProcesses: favoriteProcesses,
        aetherSource: aetherSource,
        sparkSpeed: sparkSpeed,
        timeScale: timeScale
      });
      // return only first node in aetherTree for root.nWstn = 0
      if(_rootNode.nWstn == 0) {
        let _an = aetherTree[0];
        _ret.push(_an.copy(_an, {
          nWstn: _an.nWstn * _rootNode.nWstn,
          rate: 60 * 2 * sparkSpeed * timeScale * _an.nWstn * _rootNode.nWstn / _an.proc.buildTime,
          isRootShard: true,
          isAT: true,
        }))
        return _ret;
      }
      // scale aetherTree
      aetherTree.map(_an => {
        _ret.push(_an.copy(_an, {
          nWstn: _an.nWstn * _rootNode.nWstn,
          rate: 60 * 2 * sparkSpeed * timeScale * _an.nWstn * _rootNode.nWstn / _an.proc.buildTime,
          isRootShard: true,
          isAT: true,
        }))
      })
      return _ret;
    }

    if(_rootNode.material == 'miasma-vial') {
      let _ret = [];
      let miasmaTree = makeMiasmaSampleTree({
        processes: processes,
        favoriteProcesses: favoriteProcesses,
        sparkSpeed: sparkSpeed,
        timeScale: timeScale
      });
      // return only first node in miasmaTree for root.nWstn = 0
      if(_rootNode.nWstn == 0) {
        let _mn = miasmaTree[0];
        _ret.push(_mn.copy(_mn, {
          nWstn: 0,
          rate: 0,
          isMT: true,
        }))
        return _ret;
      }
      // scale miasmaTree
      miasmaTree.map(_mn => {
        let _nWstn;
        if(_mn.material == 'miasma-vial'){
          _nWstn = _mn.nWstn * _rootNode.nWstn;
        }
        else {
          _nWstn = _mn.nWstn * _rootNode.nWstn / sparkSpeed;
        }
        _ret.push(_mn.copy(_mn, {
          nWstn: _nWstn,
          rate: 60 * 2 * timeScale * _mn.nWstn * _rootNode.nWstn / _mn.proc.buildTime,
          isMT: true,
        }))
      })
      return _ret;
    }

    return expandNode({
      currNode: _rootNode,
      processes: processes,
      favoriteProcesses: favoriteProcesses,
      sparkSpeed: sparkSpeed,
      timeScale: timeScale
    });
  });
  return _expandRootNode;
}

// const topology = require(`assets/jsons/topology.json`);
// todo: add preference for multiple inbound paths
// tree bark, limestone
// aether-shard, aetheric-pellet

export const accumulate = ({
  Trees: Trees,
  processes: processes,
  favoriteProcesses: favoriteProcesses,
  miasmaTree: miasmaTree,
  fuel: fuel,
  sparkSpeed: sparkSpeed,
  timeScale: timeScale,
  OddSpark: OddSpark,
  sortOrder: sortOrder,
  ignoreMaterials: ignoreMaterials,
  allWorkstations: allWorkstations,
}) => {
  const allUnitedTree = Trees
    .flat();
    // .sort((a, b) => sortWithDict(
    //   a.proc.id,
    //   b.proc.id,
    //   topology.processes
    // ));
  let _ret = new NodeSetAccumulate();
  // let allMaterials = [];
  // let byMaterial = {};
  allUnitedTree.map(_unode => {
    _unode.proc.to.map(_t => {
      const _material = _t.material;
      if(_ret.byMaterial[_material]) {
        return;
      }
      const _unodeProc = Process.copy(_unode.proc, {});
      _ret.add({
        material: _material,
        proc: _unodeProc,
      })
      // _ret.byMaterial[_material].procs = [];
      // _ret.byMaterial[_material].procs.push(_unodeProc);
      
      // _ret.byMaterial[_material].procs.push(structuredClone(_unode.proc));
    });
  });
  // tmp fix for fuel

  // allUnitedTree.map(_unode => {
  //   _unode.proc.fuel.map(_fuel => {
  //     const _material = _fuel.material;
  //     if(_ret.byMaterial[_material]) {
  //       return;
  //     }
  //     _ret.allMaterials.push(_material);
  //     _ret.byMaterial[_material] = new NodeAccumulate(_material);
  //   });
  // });

  allUnitedTree.map(_unode => {
    const _unodeProc = Process.copy(_unode.proc, {});
    
    // src && from
    _unodeProc.to.map(_t => {
      const _mSrc = _ret.byMaterial[_t.material].src;
      // _mSrc.addProc(Process.copy(_unodeProc, {}));
      // _ret.byMaterial[_t.material].procs = [];
      // _ret.byMaterial[_t.material].procs.push(_unodeProc);
      // <= _ret.byMaterial[_t.material].addProc(Process.copy(_unodeProc, {})); did not work...
      _unodeProc.from.map(_f => {
        if(_f.material == 'aether-shard' && miasmaTree.length == 0) {
          _mSrc.add({
            material: _f.material,
            ipu: _unode.rate * _unodeProc.from.find(x => x.material === _f.material).amount,
          })
          _mSrc.byMaterial[_f.material].craftable = false;
          return ;
        }
        if(!OddSpark.material.find(x => x.id === _f.material).craftable
          || ignoreMaterials.includes(_f.material)) {
            _mSrc.add({
              material: _f.material,
              ipu: _unode.rate * _unodeProc.from.find(x => x.material === _f.material).amount,
            })
            _mSrc.byMaterial[_f.material].craftable = false;
            return ;
        }
        let _prevProc =[];
        if(_f.material == 'aether-shard') {
          _prevProc.push(Process.copy(miasmaTree[0].proc, {}));
        }
        _prevProc.push(processTo({
          material: _f.material,
          processes: processes,
          favoriteProcesses: favoriteProcesses,
          })[0]
        );
        const _prevTo = _prevProc[0].to[0].amount;
        const _prevBT = _prevProc[0].buildTime;
        const _currFr = _unodeProc.from.find(x => x.material === _f.material).amount;
        let _nWstn;
        if(_f.material == 'miasma-vial') {
          _nWstn = _unode.rate * _currFr / _prevTo * _prevBT / (60 * 2 * timeScale);
        }
        else {
          _nWstn = _unode.rate * _currFr / _prevTo * _prevBT / (60 * 2 * sparkSpeed * timeScale);
        }
        _mSrc.add({
          material: _f.material,
          rate: _unode.rate * _currFr / _prevTo,
          nWstn: _nWstn,
          ipu: _unode.rate * _currFr,
          proc: _prevProc[0]
        })
        _mSrc.byMaterial[_f.material].craftable = true;
      });
    });
    // src && fuel
    _unodeProc.to.map(_t => {
      const _mSrc = _ret.byMaterial[_t.material].srcF;
      // const _mSrc = _ret.byMaterial[_t.material].src;
      if (_unodeProc.fuelRequired) {
        const _prevProc = processTo({
          material: fuel.id,
          processes: processes,
          favoriteProcesses: favoriteProcesses,
        })[0];
        const _prevTo = _prevProc.to[0].amount;
        const _prevBT = _prevProc.buildTime;
        const _currFu = fuel.amount;
        _mSrc.add({
          material: fuel.id,
          rate: _unode.rate * _currFu / _prevTo,
          nWstn: _unode.nWstn * _currFu / (_prevTo / _prevBT) / (60 * 2 * sparkSpeed),
          ipu: _unode.nWstn * _currFu * timeScale,
          proc: _prevProc
        });
        _mSrc.byMaterial[fuel.id].craftable = OddSpark.material.find(x => x.id === fuel.id).craftable;
      }
    });

    _unodeProc.from.map(_f => {
      if(!_ret.byMaterial[_f.material]) {
        // console.log(`material ${_f.material} not found`);
        return;
      }
      if(_unode.nWstn == 0){
        return;
      }
      // 0nWstn
      // hide ingredient -> yield in subrow for 0nWstn
      let _mDest;

      // dest && from && !isRootShard
      if (!_unode.isRootShard) {
        _mDest = _ret.byMaterial[_f.material].dest;
      }
      // dest && from && isRootShard
      else {
        _mDest = _ret.byMaterial[_f.material].destS;
      }
      _unodeProc.to.map(_t => {
        let _prevProc =[];
        if(_f.material == 'aether-shard') {
          _prevProc.push(Process.copy(miasmaTree[0].proc, {}));
        }
        _prevProc.push(processTo({
          material: _f.material,
          processes: processes,
          favoriteProcesses: favoriteProcesses,
          })[0]
        );
        const _prevTo = _prevProc[0].to[0].amount;
        const _prevBT = _prevProc[0].buildTime;
        // const _currBT = _unodeProc.buildTime;
        const _currFr = _unodeProc.from.find(x => x.material === _f.material).amount;
        let _nWstn;
        if(_f.material == 'miasma-vial') {
          _nWstn = _unode.rate * _currFr / (_prevTo / _prevBT) / (60 * 2 * timeScale);
        }
        else {
          _nWstn = _unode.rate * _currFr / (_prevTo / _prevBT) / (60 * 2 * sparkSpeed * timeScale);
        }
        _mDest.add({
          material: _t.material,
          rate: _unode.rate * _currFr / _prevTo,
          nWstn: _nWstn,
          // nWstn: _unode.nWstn * _prevBT / _currBT * _currFr /_prevTo,
          ipu: _unode.rate * _currFr,
        });
      });
    });
    
    if (_unodeProc.fuelRequired){
      if(_unode.nWstn == 0){
        return;
      }
      if(!_ret.byMaterial[fuel.id]) {
        // console.log(`material ${fuel.id} not found`);
        return;
      }
      // dest && fuel && !isRootFuel
      let _mDest;
      if (!_unode.isRootFuel) {
        _mDest = _ret.byMaterial[fuel.id].destF;
      }
      // dest && fuel && isRootFuel
      // isRootFuel && fuelRequired => fuel.id = 'coal'
      else {
        _mDest = _ret.byMaterial[fuel.id].destRF;
      }
      _unodeProc.to.map(_t => {
        const _prevProc = processTo({
          material: fuel.id,
          processes: processes,
          favoriteProcesses: favoriteProcesses,
        })[0];
        const _prevTo = _prevProc.to[0].amount;
        const _prevBT = _prevProc.buildTime;
        const _currFu = fuel.amount;
        _mDest.add({
          material: _t.material,
          rate: _unode.rate * _currFu / _prevTo,
          nWstn: _unode.nWstn * _currFu / (_prevTo / _prevBT) / (60 * 2 * sparkSpeed),
          ipu: _unode.nWstn * _currFu * timeScale,
        });
      });
    }
  });

  _ret.allMaterials.map(_material => {
    _ret.byMaterial[_material].dest['netRate'] = 0;
    _ret.byMaterial[_material].dest['netNWstn'] = 0;
    _ret.byMaterial[_material].dest['netIpu'] = 0;
  });
  let firstNodes = [];
  if(Trees.flat().length > 0){
    Trees.map(_tree => {
      firstNodes.push(_tree[0]);
    })
    // allUnitedTree.map(_unode => {
    //   if(!_unode.isFN && _unode.depth == 0){
    //     firstNodes.push(_unode);
    //   }
    // });
    firstNodes.map(_node => {
      const rootMaterial = _node.proc.to[0].material;
      _ret.byMaterial[rootMaterial].dest['netNWstn'] += _node.nWstn;
      _ret.byMaterial[rootMaterial].dest['netIpu'] += _node.proc.to[0].amount * _node.rate;
      // _ret.byMaterial[rootMaterial].dest.add({
      //   material: 'FIN',
      //   rate: _node.rate,
      //   nWstn: _node.nWstn,
      //   ipu: _node.proc.to[0].amount * _node.rate,
      // });
    });
  
    // const finalNode = allUnitedTree[0];
    // const finalProc = Process.copy(finalNode.proc, {});
    // const rootMaterial = finalProc.to[0].material;
    // _ret.byMaterial[rootMaterial].dest.add({
    //   material: 'FIN',
    //   rate: finalNode.rate,
    //   nWstn: finalNode.nWstn,
    //   ipu: finalProc.to[0].amount * finalNode.rate,
    //   // todo: check
    // });
  }  
  _ret.allMaterials.map(_material => {
    // _ret.byMaterial[_material].dest.allMaterials.map(_mmaterial => {
    //   _ret.byMaterial[_material].dest['netRate'] += _ret.byMaterial[_material].dest.byMaterial[_mmaterial].netRate;
    // });
    // _ret.byMaterial[_material].destF.allMaterials.map(_mmaterial => {
    //   _ret.byMaterial[_material].dest['netRate'] += _ret.byMaterial[_material].destF.byMaterial[_mmaterial].netRate;
    // });

    _ret.byMaterial[_material].dest.allMaterials.map((_mmaterial) => {
      _ret.byMaterial[_material].dest['netNWstn'] += _ret.byMaterial[_material].dest.byMaterial[_mmaterial].netNWstn;
    });
    _ret.byMaterial[_material].destF.allMaterials.map((_mmaterial) => {
      _ret.byMaterial[_material].dest['netNWstn'] += _ret.byMaterial[_material].destF.byMaterial[_mmaterial].netNWstn;
    });
    _ret.byMaterial[_material].destS.allMaterials.map((_mmaterial) => {
      if(_material != 'aether-shard') {
        _ret.byMaterial[_material].dest['netNWstn'] += _ret.byMaterial[_material].destS.byMaterial[_mmaterial].netNWstn;
      }
    });

    _ret.byMaterial[_material].dest.allMaterials.map((_mmaterial) => {
      _ret.byMaterial[_material].dest['netIpu'] += _ret.byMaterial[_material].dest.byMaterial[_mmaterial].netIpu;
    });
    _ret.byMaterial[_material].destF.allMaterials.map((_mmaterial) => {
      _ret.byMaterial[_material].dest['netIpu'] += _ret.byMaterial[_material].destF.byMaterial[_mmaterial].netIpu;
    });
    _ret.byMaterial[_material].destS.allMaterials.map((_mmaterial) => {
      if(_material != 'aether-shard') {
        _ret.byMaterial[_material].dest['netIpu'] += _ret.byMaterial[_material].destS.byMaterial[_mmaterial].netIpu;
      }
    });
  });

  // dest, destF, destS, destRF
  // dest: cosumed as from, !isRootShard
  // destS: consumed as from, isRootShard
  // destF: consumed as fuel, !isRootFuel
  // destRF: consumed as fuel, isRootFuel

  // render with fire icon in table
  // destF, destRF

  // values to adjust
  // destS: self consumption of aether-shard
  // destRF: self consumption of coal


  _ret.allMaterials.map(_material => {
    if(_ret.byMaterial[_material].dest['netIpu'] ==0 ){
      return ;
    }
    _ret.byMaterial[_material].dest.allMaterials.map(_mmaterial => {
      _ret.byMaterial[_material].dest.byMaterial[_mmaterial].percent = 0;
      _ret.byMaterial[_material].dest.byMaterial[_mmaterial].percent = _ret.byMaterial[_material].dest.byMaterial[_mmaterial].netIpu / _ret.byMaterial[_material].dest['netIpu'];
      _ret.byMaterial[_material].hasDest = true;
    })
    _ret.byMaterial[_material].destF.allMaterials.map(_mmaterial => {
      _ret.byMaterial[_material].destF.byMaterial[_mmaterial].percent = 0;
      _ret.byMaterial[_material].destF.byMaterial[_mmaterial].percent = _ret.byMaterial[_material].destF.byMaterial[_mmaterial].netIpu / _ret.byMaterial[_material].dest['netIpu'];
      _ret.byMaterial[_material].hasDest = true;
    })
    _ret.byMaterial[_material].destS.allMaterials.map(_mmaterial => {
      _ret.byMaterial[_material].destS.byMaterial[_mmaterial].percent = 0;
      _ret.byMaterial[_material].destS.byMaterial[_mmaterial].percent = _ret.byMaterial[_material].destS.byMaterial[_mmaterial].netIpu / _ret.byMaterial[_material].dest['netIpu'];
      _ret.byMaterial[_material].hasDest = true;
    })
    _ret.byMaterial[_material].destRF.allMaterials.map(_mmaterial => {
      _ret.byMaterial[_material].destRF.byMaterial[_mmaterial].percent = 0;
      _ret.byMaterial[_material].destRF.byMaterial[_mmaterial].percent = _ret.byMaterial[_material].destRF.byMaterial[_mmaterial].netIpu / _ret.byMaterial[_material].dest['netIpu'];
      _ret.byMaterial[_material].hasDest = true;
    })
  })

  _ret.allMaterials.map(_material => {
    _ret.byMaterial[_material].depth = 0;
    _ret.byMaterial[_material].i = -1;
    // depth : depth of sankey diagram in factorio calculator
    // i : variable to sort _ret.allMaterials by topological order
  })

  allUnitedTree.map((_unode, idx) => {
    // operate (_unode.proc.to[0].material, idx) and (_unode.proc.fuel[0].material, idx) in each _unode
    // if _unode.isFN = false
    //

    // => need to consider material only consume by fuel type (wooden-log)
    // if(_unode.isFN){
    //   return;
    // }

    if (_unode.proc.fuelRequired && _ret.byMaterial[fuel.id].i < idx + 1) {
      _ret.byMaterial[fuel.id].i = idx + 1;
      // _ret.byMaterial[fuel.id].i = idx + 1.1;
      // give bigger idx to materal with fuel type
      // check #check1
    }
    _unode.proc.to.map(_t => {
      if (_ret.byMaterial[_t.material].i < idx + 1) {
        _ret.byMaterial[_t.material].i = idx;
      }
    })
  })

  // case for wooden-log produced only in fueltree
  // _ret.allMaterials.map(_material => {
  //   if(_ret.byMaterial[_material].i == -1) {
  //     _ret.byMaterial[_material].i = allUnitedTree.length;
  //   }
  // })

  // #check1
  // _ret.allMaterials.map(_material => {
  //   console.log(_ret.byMaterial[_material])
  //   console.log(_material)
  //   console.log(_ret.byMaterial[_material].i)
  // })
  _ret.allMaterials.sort()
  if(sortOrder == 'topological') {
    _ret.allMaterials.sort((a, b) => _ret.byMaterial[a].i - _ret.byMaterial[b].i)
  }
  
  _ret.allMaterials.map(_material => {
    _ret.byMaterial[_material].ceiledNWstn = Math.ceil(_ret.byMaterial[_material].dest['netNWstn']);
  })

  let allWstns = [];
  let byWstn = {};

  allUnitedTree.map(_unode => {
    const _wstn = _unode.proc.workstation;
    if(!byWstn[_wstn]) {
      allWstns.push(_wstn);
      byWstn[_wstn] = {
        total: 0,
      };
    }
  });

  _ret.allMaterials.map(_material => {
    byWstn[_ret.byMaterial[_material].procs[0].workstation].total += Math.ceil(_ret.byMaterial[_material].dest['netNWstn']);
  })
  
  let allWstnMaterials = [];
  let byWstnMaterial = {};
  
  allWstns.map(_wstn => {
    const wstnInfo = allWorkstations.find(_awstn => _awstn.id == _wstn);

    wstnInfo.cost.map(_c => {
      if(!byWstnMaterial[_c.id]) {
        allWstnMaterials.push(_c.id);
        byWstnMaterial[_c.id] = {
          total: 0,
        };
      }
    })
  })

  allWstns.map(_wstn => {
    const costs = allWorkstations.find(_awstn => _awstn.id == _wstn).cost;
    costs.map(_c => {
      byWstnMaterial[_c.id].total += byWstn[_wstn].total * _c.amount;
    })
  })

  return {
    byMaterial: _ret.byMaterial,
    allMaterials: _ret.allMaterials,
    byWstn: byWstn,
    allWstns: allWstns,
    byWstnMaterial: byWstnMaterial,
    allWstnMaterials: allWstnMaterials,
  };
}