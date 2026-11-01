import { put, takeEvery } from "redux-saga/effects";

import {
  CHANGE_JSON,
  CHANGE_SPARK,
  CHANGE_FUEL,
  CHANGE_RATE_DISPLAY,
  CHANGE_RATE_PRECISION,
} from "./actionTypes"

import {
  changeJsonSuccess,
  changeSparkSuccess,
} from "./actions"

function* changeJson({ payload }) {
  const _oddspark = require(`assets/jsons/${payload.json}`);
  yield put(changeJsonSuccess({ json: payload, oddspark: _oddspark }));
}

function* calculatorSaga() {
  yield takeEvery(CHANGE_JSON, changeJson);
}

export default calculatorSaga;