import PropTypes from "prop-types";
import React, { useEffect, useState } from "react";
import {
  Button,
  ButtonGroup,
  Container,
} from "reactstrap";
import logo from "../../assets/images/logo.png";


//i18n
import { withTranslation } from "react-i18next";
import MaterialTree from "./MaterialTree";
import MaterialTable from "./MaterialTable";
import { useNavigate } from "react-router-dom";
import Settings from "./Settings";
import { useSelector } from "react-redux";
import { selectOddSpark } from "store/calculator/selector";
import CSVView from "./CSVView";
import { useDispatch } from "react-redux";
import {
  changeView
} from "store/actions";
import SelectMaterial from "./SelectMaterial";
import CalculateCore from "./calculate";
import About from "./about";
import Frame from "./Frame";
import Workstation from "./Workstation";


const Calculator = props => {
  document.title = "Pirate Spark | Calculator";
  const navigate = useNavigate();
  const OddSpark = useSelector((state) => selectOddSpark(state));
  const dispatch = useDispatch();

  const view = useSelector((state) => state.Calculator.view);
  const onChangeView = (_view) => {
    dispatch(changeView(_view));
  }

  const [debugCount, setDebugCount] = useState(0);
  useEffect(() => {
    if (debugCount > 7) {
      navigate("/debug");
    }
  }, [debugCount]);
  const onClickVersion = () => {
    setDebugCount(debugCount + 1);
    console.log("Debug count: ", debugCount);
  };

  return (<CalculateCore>
    {/* <div className="page-content"> */}
    <Frame>
      <Container fluid>
        <div style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "flex-start",
          alignItems: "center",
        }}>
          <span className="logo-sm">
            <a href="/">
              <img src={logo} alt="" height="26" />
            </a>
          </span>
          <div style={{ paddingLeft: 8 }}>
            <a href="/">
              <h2 style={{ marginBottom: 0 }}>Pirate Spark</h2>
            </a>
          </div>
        </div>

        <div style={{ paddingTop: 5 }}>
          <a onClick={onClickVersion}>
            version {OddSpark.version}
          </a>
        </div>

        <div style={{ height: 20 }} />

        <SelectMaterial />

        <ButtonGroup style={{
          marginTop: 20,
        }}>
          <Button
            onClick={() => onChangeView("table")}
            active={view === "table"}
          >
            Table
          </Button>
          <Button
            onClick={() => onChangeView("tree")}
            active={view === "tree"}
          >
            Tree
          </Button>
          <Button
            onClick={() => onChangeView("workstation")}
            active={view === "workstation"}
          >
            Workstation
          </Button>

          {/* <Button
            onClick={() => onChangeView("csv")}
            active={view === "csv"}
          >
            CSV
          </Button> */}
          <Button
            onClick={() => onChangeView("about")}
            active={view === "about"}
          >
            About
          </Button>
          <Button
            onClick={() => onChangeView("settings")}
            active={view === "settings"}
          >
            Settings
          </Button>
        </ButtonGroup>

        <div style={{ height: "20px" }}></div>

        {(view === "table") && <MaterialTable />}

        {(view === "tree") && <MaterialTree />}

        {(view === "workstation") && <Workstation />}

        {(view === "csv") && <CSVView />}

        {(view === "about") && <About />}

        {(view === "settings") && <Settings />}
      </Container>
    {/* </div> */}
    </Frame>
  </CalculateCore>);
};

Calculator.propTypes = {
  t: PropTypes.any,
  chartsData: PropTypes.any,
  onGetChartsData: PropTypes.func,
};

export default withTranslation()(Calculator);
