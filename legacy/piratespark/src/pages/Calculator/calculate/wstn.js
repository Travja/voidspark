export class CostUnit {
  constructor(id, amount) {
    this._id = id;
    this._amount = amount;
  }
  get id() { return this._id; }
  get amount() { return this._amount; }
}

CostUnit.prototype.toString = function() {
  return `${this.id}(x${this.amount})`;
}

export class Workstation {
  constructor({
    id: id,
    category: category,
    name: name,
    cost: cost,
  }) {
    this._id = id; // string
    this._category = category; // string
    this._name = name; // string
    this._cost = cost; // list of CostUnit
  }

  static fromJSON(json) {
    return new Workstation({
      id: json.id,
      category: json.category,
      name: json.name,
      cost: json.cost.map((_c) => {
        return new CostUnit(_c.id, _c.amount);
      }),
    });
  }

  static copy(wstn, rest) {
    return new Workstation({
      id: wstn.id,
      category: wstn.category,
      name: wstn.name,
      cost: wstn.cost.map((_c) => {
        return new CostUnit(_c.id, _c.amount);
      }),
      ...rest,
    });
  }

  get id() { return this._id; }
  get category() { return this._category; }
  get name() { return this._name; }
  get cost() { return this._cost; }
  set id(id) { this._id = id; }
  set category(category) { this._category = category; }
  set name(name) { this._name = name; }
  set cost(cost) { this._cost = cost; }
}