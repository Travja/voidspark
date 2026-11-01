export class MaterialUnit {
  constructor(material, amount) {
    this._material = material;
    this._amount = amount;
  }
  get material() { return this._material; }
  get amount() { return this._amount; }
}

MaterialUnit.prototype.toString = function() {
  return `${this.material}(x${this.amount})`;
}

export class Process {
  constructor({
    id: id,
    name: name,
    from: from,
    to: to,
    buildTime: buildTime,
    fuelRequired: fuelRequired,
    workstation: workstation,
    isRootProcess: isRootProcess=false,
  }) {
    this._id = id;  // string
    this._name = name;  // string
    this._from = from;  // list of MaterialUnit
    this._to = to;  // list of MaterialUnit
    this._buildTime = buildTime;  // float
    this._fuelRequired = fuelRequired;  // bool
    this._workstation = workstation;  // string
    this._isRootProcess = isRootProcess;  // bool
  }

  static fromJSON(json) {
    return new Process({
      id: json.id,
      name: json.name,
      from: json.from.map((_f) => {
        return new MaterialUnit(_f.material, _f.amount);
      }),
      to: json.to.map((_t) => {
        return new MaterialUnit(_t.material, _t.amount);
      }),
      buildTime: json.buildTime,
      fuelRequired: json.fuelRequired,
      workstation: json.workstation,
    });
  }

  static copy(proc, rest) {
    return new Process({
      id: proc.id,
      name: proc.name,
      from: proc.from.map((_f) => {
        return new MaterialUnit(_f.material, _f.amount);
      }),
      to: proc.to.map((_t) => {
        return new MaterialUnit(_t.material, _t.amount);
      }),
      buildTime: proc.buildTime,
      fuelRequired: proc.fuelRequired,
      workstation: proc.workstation,
      ...rest,
    });
  }

  get id() { return this._id; }
  get name() { return this._name; }
  get from() { return this._from; }
  get to() { return this._to; }
  get buildTime() { return this._buildTime; }
  get fuelRequired() { return this._fuelRequired; }
  get workstation() { return this._workstation; }
  get isRootProcess() { return this._isRootProcess; }
  set id(id) { this._id = id; }
  set name(name) { this._name = name; }
  set from(from) { this._from = from; }
  set to(to) { this._to = to; }
  set buildTime(buildTime) { this._buildTime = buildTime; }
  set fuelRequired(fuelRequired) { this._fuelRequired = fuelRequired; }
  set workstation(workstation) { this._workstation = workstation; }
  set isRootProcess(isRootProcess) { this._isRootProcess = isRootProcess; }
}

export class Node {
  constructor({
    proc: proc,
    material: material,
    depth: depth,
    nWstn: nWstn,
    rate: rate,
    fpuInT: fpuInT,
    fpuinFT: fpuinFT,
    isRootShard: isRootShard=false,
    isRootFuel: isRootFuel=false,
    isAT: isAT=false,
    isMT: isMT=false,
    isFN: isFN=false,
    isUT: isUT=false,
    timeScale: timeScale,
  }) {
    this._proc = proc;
    this._material = material;
    this._depth = depth;
    this._nWstn = nWstn;
    this._rate = rate;
    this._fpuInT = fpuInT;
    this._fpuinFT = fpuinFT;
    this._isRootShard = isRootShard;
    this._isRootFuel = isRootFuel;
    this._isAT = isAT;
    this._isMT = isMT;
    this._isFN = isFN;
    this._isUT = isUT;
    this._timeScale = timeScale;
  }

  copy(cn, rest) {
    return new Node({
      proc: Process.copy(cn.proc, {}),
      material: cn.material,
      depth: cn.depth,
      nWstn: cn.nWstn,
      rate: cn.rate,
      fpuInT: cn.fpuInT,
      fpuinFT: cn.fpuinFT,
      isRootShard: cn.isRootShard,
      isRootFuel: cn.isRootFuel,
      isAT: cn.isAT,
      isMT: cn.isMT,
      isFN: cn.isFN,
      isUT: cn.isUT,
      timeScale: cn.timeScale,
      ...rest,
    });
  }
  add({
    nWstn: nWstn,
    fpuInT: fpuInT,
    fpuinFT: fpuinFT,
  }) {
    if(nWstn) {
      this._nWstn += nWstn;
    }
    if(fpuInT) {
      this._fpuInT += fpuInT;
    }
    if(fpuinFT) {
      this._fpuinFT += fpuinFT;
    }
  }

  get proc() { return this._proc; }
  get material() { return this._material; }
  get depth() { return this._depth; }
  get nWstn() { return this._nWstn; }
  get rate() { return this._rate; }
  get fpuInT() { return this._fpuInT}
  get fpuinFT() { return this._fpuinFT}
  get isRootShard() { return this._isRootShard; }
  get isRootFuel() { return this._isRootFuel; }
  get isAT() { return this._isAT; }
  get isMT() { return this._isMT; }
  get isFN() { return this._isFN; }
  get isUT() { return this._isUT; }
  get timeScale() { return this._timeScale; }
  set proc(proc) { this._proc = proc; }
  set material(material) { this._material = material; }
  set depth(depth) { this._depth = depth; }
  set nWstn(nWstn) { this._nWstn = nWstn; }
  set rate(rate) { this._rate = rate; }
  set fpuInT(fpuInT) { this._fpuInT = fpuInT;}
  set fpuinFT(fpuinFT) { this._fpuinFT = fpuinFT;}
  set isRootShard(isRootShard) { this._isRootShard = isRootShard; }
  set isRootFuel(isRootFuel) { this._isRootFuel = isRootFuel; }
  set isAT(isAT) { this._isAT = isAT; }
  set isMT(isMT) { this._isMT = isMT; }
  set isFN(isFN) { this._isFN = isFN; }
  set isUT(isUT) { this._isUT = isUT; }
  set timeScale(timeScale) { this._timeScale = timeScale; }
}

export class NodeSetAccumulate {
  constructor() {
    this._byMaterial = {};
    this._allMaterials = [];
    this._procs = [];
  }

  addProc(proc) {
    if(!proc) {
      return;
    }
    this._procs.push(proc);
  }

  add({
    material: material,
    proc: proc,
    rate: rate,
    nWstn: nWstn,
    ipu: ipu,
  }) {
    if(!material) {
      return;
    }
    if(!this._byMaterial[material]) {
      this._allMaterials.push(material);
      this._byMaterial[material] = new NodeAccumulate(material);
      // this._byMaterial[material] = {
      //   netRate: 0,
      //   netNWstn: 0,
      //   netIpu: 0,
      //   procs: [],
      // }
    }
    if(proc) {
      this._byMaterial[material].procs.push(proc);
    }
    if(rate) {
      this._byMaterial[material].netRate += rate;
    }
    if(nWstn) {
      this._byMaterial[material].netNWstn += nWstn;
    }
    if(ipu) {
      this._byMaterial[material].netIpu += ipu;
    }
  }

  get procs() { return this._procs; }
  get byMaterial() { return this._byMaterial; }
  get allMaterials() { return this._allMaterials; }
}

export class NodeAccumulate {
  constructor(material) {
    this._material = material;
    this._src = new NodeSetAccumulate();
    this._srcF = new NodeSetAccumulate();
    // this._srcR = new NodeSetAccumulate();
    // this._srcRF = new NodeSetAccumulate();
    this._dest = new NodeSetAccumulate();
    this._destF = new NodeSetAccumulate();
    this._destS = new NodeSetAccumulate();
    this._destRF = new NodeSetAccumulate();
    this._procs = [];
    this._netRate = 0;
    this._netNWstn = 0;
    this._netIpu = 0;
  }

  get material() { return this._material; }
  get src() { return this._src; }
  get srcF() { return this._srcF; }
  // get srcR() { return this._srcR; }
  // get srcRF() { return this._srcRF; }
  get dest() { return this._dest; }
  get destF() { return this._destF; }
  get destS() { return this._destS; }
  get destRF() { return this._destRF; }
  get procs() { return this._procs; }
  get netRate() { return this._netRate; }
  get netNWstn() { return this._netNWstn; }
  get netIpu() { return this._netIpu; }
  set procs(procs) { this._procs = procs; }
  set netNWstn(netNWstn) { this._netNWstn = netNWstn; }
  set netRate(netRate) { this._netRate = netRate; }
  set netIpu(netIpu) { this._netIpu = netIpu; }
}

export const processTo = ({
  material: material,
  processes: processes,
  favoriteProcesses: favoriteProcesses,
  isRootProcess: isRootProcess=false,
  sort: sort=true,
}) => {
  if (!favoriteProcesses) {
    console.warn('favoriteProcesses is not defined');
  }
  let _candidateProcesses = [];
  processes.map(_p => {
    _p.to.map(_t => {
      if (_t.material !== material) {
        return;
      }

      const _pp = Process.copy(_p, {
        fuel: _p.fuelRequired,
        isRootProcess: isRootProcess,
      });
      _candidateProcesses.push(_pp);
    })
  })
  
  if (favoriteProcesses.length == 0) {
    return _candidateProcesses;
  }

  if (!sort) {
    return _candidateProcesses;
  }

  let _ret = [];
  _candidateProcesses.map(_p => {
    if (favoriteProcesses.includes(_p.id)) {
      _ret.unshift(_p);
    }
    else {
      _ret.push(_p);
    }
  })

  return _ret;
}
