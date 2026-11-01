import {
  CHANGE_SELECTED,
  CHANGE_VIEW,
  CHANGE_JSON,
  CHANGE_JSON_SUCCESS,
  CHANGE_SPARK,
  CHANGE_FUEL,
  CHANGE_AETHER_SOURCE,
  CHANGE_RATE_DISPLAY,
  CHANGE_RATE_PRECISION,
  CHANGE_SORT_ORDER,
  CHANGE_FAVORITE_PROCESSES,
} from "./actionTypes"

const initial_json = {
  version: "0.2.3",
  json: "oddsparks_0_2.json",
}
const initial_oddspark = require(`assets/jsons/${initial_json.json}`);

export const INIT_STATE = {
  selected: [
    {
      material: "coal",
      numWorkstation: 1,    
    }
  ],
  view: "tree",
  json: initial_json,
  oddspark: initial_oddspark,
  spark: {
    id: "crafty-spark-block",
    speed: 1.5,
  },
  fuel: {
    id: "wooden-log",
    name: "Wooden Log",
    amount: 12
  },
  aetherSource: "aether-shard",
  rateDisplay: {
    "id": "ipm",
    "name": "Items / Minute",
  },
  ratePrecision: 2,
  sortOrder: "topological",
  favoriteProcesses: ["bark"],
}

const Calculator = (state = INIT_STATE, action) => {
  switch (action.type) {
    case CHANGE_SELECTED:
      return {
        ...state,
        selected: action.payload,
      }
    case CHANGE_VIEW:
      return {
        ...state,
        view: action.payload,
      }
    case CHANGE_JSON_SUCCESS:
      return {
        ...state,
        json: action.payload.json,
        oddspark: action.payload.oddspark,
      }
    case CHANGE_SPARK:
      return {
        ...state,
        spark: action.payload,
      }
    case CHANGE_FUEL:
      return {
        ...state,
        fuel: action.payload,
      }
    case CHANGE_AETHER_SOURCE:
      return {
        ...state,
        aetherSource: action.payload,
      }
    case CHANGE_RATE_DISPLAY:
      return {
        ...state,
        rateDisplay: action.payload,
      }
    case CHANGE_RATE_PRECISION:
      return {
        ...state,
        ratePrecision: action.payload,
      }
    case CHANGE_SORT_ORDER:
      return {
        ...state,
        sortOrder: action.payload,
      }
    case CHANGE_FAVORITE_PROCESSES:
      return {
        ...state,
        favoriteProcesses: action.payload,
      }

    case CHANGE_JSON:
    case CHANGE_SPARK:
      return state

    default:
      return state
  }
}

export default Calculator
