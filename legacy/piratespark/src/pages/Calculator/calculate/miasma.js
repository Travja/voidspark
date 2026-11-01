import { expandNode } from "./chain";
import { Node, processTo } from "./proc";

export const makeMiasmaSampleTree = ({
  processes: processes,
  favoriteProcesses: favoriteProcesses,
  sparkSpeed: sparkSpeed,
  timeScale: timeScale
}) => {
    
  const _proc = processTo({
    material: 'miasma-vial',
    processes: processes,
    favoriteProcesses: favoriteProcesses,
  })[0];

  return expandNode({
    currNode: new Node({
      proc: _proc,
      material: 'miasma-vial',
      depth: 0,
      nWstn: 1,
      timeScale: timeScale,
    }),
    processes: processes,
    favoriteProcesses: favoriteProcesses,
    sparkSpeed: sparkSpeed,
    timeScale: timeScale,
    stopAtMiasma: false,
  });
}

export const appendMiasmaNode = ({
  tree: tree,
  miasmaTree: miasmaTree,
  sparkSpeed: sparkSpeed,
  timeScale: timeScale,
}) => {

  if(tree.length == 0) {
    return [];
  }

  if(tree[0].material == 'miasma-vial') {
    let _ret = [];
    tree.map(_tn => {
      _ret.push(_tn.copy(_tn, {
        isMT: true
      }));
    });
    return _ret;
  }
  
  let _ret = [];

  tree.map(_tn => {
    _ret.push(_tn.copy(_tn, {
      isMT: true
    }));
    _tn.proc.from.map(_f => {
      if(_f.material != 'miasma-vial') {
        return [];
      }
      if(_tn.nWstn == 0) {
        return [];
      }
      // 0nWstn 

      miasmaTree.map(_mn => {
        const P = miasmaTree[0].proc.to[0].amount * miasmaTree[0].nWstn / miasmaTree[0].proc.buildTime;
        let _nWstn;
        let _rate;
        if(_mn.material !== 'miasma-vial') {
            _nWstn = _mn.nWstn * _f.amount * _tn.nWstn / _tn.proc.buildTime / P;
            _rate = 60 * 2 * sparkSpeed * timeScale * _nWstn / _mn.proc.buildTime;
        }
        else {
            _nWstn = _mn.nWstn * _f.amount * _tn.nWstn / _tn.proc.buildTime / P * sparkSpeed;
            _rate = 60 * 2 * timeScale * _nWstn / _mn.proc.buildTime;
        }
        _ret.push(_mn.copy(_mn, {
          depth: _mn.depth + _tn.depth + 1,
          nWstn: _nWstn,
          rate: _rate,
          isMT: true,
        }));
      });
    });
  });

  return _ret;
}