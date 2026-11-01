import {
  CHANGE_SELECTED,
  CHANGE_VIEW,
  CHANGE_JSON,
  CHANGE_JSON_SUCCESS,
  CHANGE_SPARK,
  CHANGE_SPARK_SUCCESS,
  CHANGE_FUEL,
  CHANGE_AETHER_SOURCE,
  CHANGE_RATE_DISPLAY,
  CHANGE_RATE_PRECISION,
  CHANGE_SORT_ORDER,
  CHANGE_FAVORITE_PROCESSES,
} from "./actionTypes"

export const changeSelected = selected => ({
  type: CHANGE_SELECTED,
  payload: selected,
})

export const changeView = view => ({
  type: CHANGE_VIEW,
  payload: view,
})

export const changeJson = json => ({
  type: CHANGE_JSON,
  payload: json,
})

export const changeJsonSuccess = json => ({
  type: CHANGE_JSON_SUCCESS,
  payload: json,
})

export const changeSpark = spark => ({
  type: CHANGE_SPARK,
  payload: spark,
})

export const changeSparkSuccess = spark => ({
  type: CHANGE_SPARK_SUCCESS,
  payload: spark,
})

export const changeFuel = fuel => ({
  type: CHANGE_FUEL,
  payload: fuel,
})

export const changeAetherSource = aetherSource => ({
  type: CHANGE_AETHER_SOURCE,
  payload: aetherSource,
})

export const changeRateDisplay = rateDisplay => ({
  type: CHANGE_RATE_DISPLAY,
  payload: rateDisplay,
})

export const changeRatePrecision = ratePrecision => ({
  type: CHANGE_RATE_PRECISION,
  payload: ratePrecision,
})

export const changeSortOrder = sortOrder => ({
  type: CHANGE_SORT_ORDER,
  payload: sortOrder,
})

export const changeFavoriteProcesses = favoriteProcesses => ({
  type: CHANGE_FAVORITE_PROCESSES,
  payload: favoriteProcesses,
})
