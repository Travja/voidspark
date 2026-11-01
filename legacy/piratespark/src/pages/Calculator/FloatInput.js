import React, { useState } from "react";
import {
  Form,
  FormFeedback,
  Input,
  Label,
} from "reactstrap";

const FloatInput = ({
  id: id,
  label: label,
  onBlur: onBlur,
  initialVal: initialVal=1,
  maxVal: maxVal,
}) => {
  const [valStr, setValStr] = useState(initialVal.toString());
  const [isValid, setIsValid] = useState(true);
  const [val, setVal] = useState(initialVal);
  const parseInputValue = (e) => {
    const _val = parseFloat(e.target.value);
    if (isNaN(_val)) {
      setIsValid(false);
      setVal(1);
      setValStr("1");
      return;
    }
    setValStr(e.target.value)
    if (_val < 0 || _val > maxVal) {
      setIsValid(false);
      return;
    }
    setVal(_val);
    setIsValid(true);
  }

  const _onBlur = () => {
    if (!isValid) {
      setVal(initialVal);
      setValStr(initialVal.toString());
    }
    onBlur(val);
  }

  return (<Form
    onSubmit={(e) => {e.preventDefault()}}
    style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 5,
  }}>
    <div style={{
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: "0px",
    }}>
      <Label
        for={"numWorkstations-" + id.toString()}
        style={{
        marginBottom: 0,
      }}>
        {label}
      </Label>
      <Input
        onChange={parseInputValue}
        onBlur={_onBlur}
        invalid={!isValid}
        style={{
          width: "80px",
        }}
        value={valStr}
        id={"numWorkstations-" + id.toString()}
      />
      <FormFeedback>
        Can only be a positive number less than {maxVal}
      </FormFeedback>
    </div>

  </Form>);
}

export default FloatInput;
