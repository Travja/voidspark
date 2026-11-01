import React from "react";
import { useDispatch } from "react-redux";
import {
  Button,
  ButtonGroup,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  UncontrolledDropdown,
} from "reactstrap";
import {
  changeAetherSource,
  changeFuel,
  changeJson,
  changeLayoutMode,
  changeRateDisplay,
  changeRatePrecision,
  changeSpark,
  changeSortOrder,
} from "store/actions";
import { useSelector } from "react-redux";
import { OddSparkImage } from "./Material";
import ImageDrop from "./ImageDrop";
import { selectOddSpark } from "store/calculator/selector";

const Settings = () => {
  const dispatch = useDispatch();
  const _settings = require("assets/jsons/settings.json");

  const _state = useSelector((state) => state.Calculator);
  const _layout = useSelector((state) => state.Layout);
  const _sortOrder = useSelector((state) => state.Calculator.sortOrder);

  const OddSpark = useSelector((state) => selectOddSpark(state));

  const onChangeJson = (_json) => {
    dispatch(changeJson(_json));
  }

  const onChangeSpark = (_spark) => {
    dispatch(changeSpark(_spark));
  }

  const onChangeFuel = (_fuel) => {
    dispatch(changeFuel(_fuel));
  }

  const onChangeAetherSource = (_aetherSource) => {
    dispatch(changeAetherSource(_aetherSource));
  }

  const onChangeRateDisplay = (_rateDisplay) => {
    dispatch(changeRateDisplay(_rateDisplay));
  }

  const onChangeRatePrecision = (_ratePrecision) => {
    dispatch(changeRatePrecision(_ratePrecision));
  }

  const onChangeLayoutMode = (_layoutModeType) => {
    dispatch(changeLayoutMode(_layoutModeType));
  }

  const onChangeSortOrder = (_sortOrderSelected) => {
    dispatch(changeSortOrder(_sortOrderSelected));
  }

  return (
    <div>
      <div style={{
        display: "flex",
        alignItems: "center",
        marginBottom: 10,
      }}>
        <div style={{ marginRight: 10, width: 100 }}>
          Appearance:
        </div>

        <ButtonGroup>
          <Button
            onClick={() => onChangeLayoutMode("light")}
            active={_layout.layoutModeType === "light"}
          >
            Light
          </Button>
          <Button
            onClick={() => onChangeLayoutMode("dark")}
            active={_layout.layoutModeType === "dark"}
          >
            Dark
          </Button>


        </ButtonGroup>
      </div>

      
      <div style={{
        display: "flex",
        alignItems: "center",
        marginBottom: 10,
      }}>
        <div style={{ marginRight: 10, width: 100 }}>
          Version:
        </div>
        <UncontrolledDropdown>
          <DropdownToggle caret>
            {_state.json.version}
          </DropdownToggle>
          <DropdownMenu>
            {_settings.json.map((_json) => {
              return <DropdownItem
                key={_json.version}
                onClick={() => onChangeJson(_json)}
              >
                {_json.version}
            </DropdownItem>
          })}
          </DropdownMenu>
        </UncontrolledDropdown>
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        marginBottom: 10,
      }}>

        <div style={{ marginRight: 10, width: 100 }}>
          Spark:
        </div>
        <UncontrolledDropdown>
          <DropdownToggle caret>
            <OddSparkImage id={_state.spark.id} uid={'sparkselected' + _state.spark.id} withPopover={false} />

          </DropdownToggle>
          <DropdownMenu>
            {_settings.spark.map((_spark) => {
              return <DropdownItem
                key={_spark.id}
                onClick={() => onChangeSpark(_spark)}
              >
                <OddSparkImage id={_spark.id} uid = {'spark' + _spark.id}/>

              </DropdownItem>
            })}
          </DropdownMenu>
        </UncontrolledDropdown>
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        marginBottom: 10,
      }}>
        <div style={{ marginRight: 10, width: 100 }}>
          Fuel:
        </div>
        {/* <UncontrolledDropdown>
          <DropdownToggle caret>
            <OddSparkImage id={_state.fuel.id} uid={'fuel-selected' + _state.fuel.id} withPopover={false}/>
          </DropdownToggle>
          <DropdownMenu>
            {_settings.fuel.map((_fuel) => {
              return <DropdownItem
                key={_fuel.id}
                onClick={() => onChangeFuel(_fuel)}
              >
                <OddSparkImage id={_fuel.id} uid={'fuel' + _fuel.id} />
              </DropdownItem>
            })}
          </DropdownMenu>
        </UncontrolledDropdown> */}
        <ImageDrop
          images={_settings.fuel}
          renderImage={OddSpark.image}
          selectedImage={_state.fuel.id}
          onSelectImage={(_fuel) => onChangeFuel(_fuel)}
          imagePerRow={4}
          size={50}
          selectedImageSize={30}
          otherImageSize={30}
        />
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        marginBottom: 10,
      }}>
        <div style={{ marginRight: 10, width: 100 }}>
          Aether source:
        </div>
        <UncontrolledDropdown>
          <DropdownToggle caret>
            <OddSparkImage id={_state.aetherSource} uid={'aether-selected' + _state.aetherSource} withPopover={false}/>
          </DropdownToggle>
          <DropdownMenu>
            {_settings.aetherSource.map((_aetherSource) => {
              return <DropdownItem
                key={_aetherSource}
                onClick={() => onChangeAetherSource(_aetherSource)}
              >
                <OddSparkImage id={_aetherSource} uid={'aether' + _aetherSource}/>
              </DropdownItem>
            })}
          </DropdownMenu>
        </UncontrolledDropdown>
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        marginBottom: 10,
      }}>
        <div style={{ marginRight: 10, width: 100 }}>
          Rate display:
        </div>
        <UncontrolledDropdown>
          <DropdownToggle caret>
            {_state.rateDisplay.name}
          </DropdownToggle>
          <DropdownMenu>
            {_settings.rateDisplay.map((_rd) => {
              return <DropdownItem
                key={_rd.id}
                onClick={() => onChangeRateDisplay(_rd)}
              >
                {_rd.name}
              </DropdownItem>
            })}
          </DropdownMenu>
        </UncontrolledDropdown>
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        marginBottom: 10,
      }}>
        <div style={{ marginRight: 10, width: 100 }}>
          Rate precision:
        </div>
        <UncontrolledDropdown>
          <DropdownToggle caret>
            {_state.ratePrecision}
          </DropdownToggle>
          <DropdownMenu>
            {_settings.ratePrecision.map((_rp) => {
              return <DropdownItem
                key={_rp}
                onClick={() => onChangeRatePrecision(_rp)}
              >
                {_rp}
              </DropdownItem>
            })}
          </DropdownMenu>
        </UncontrolledDropdown>
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        marginBottom: 10,
      }}>
        <div style={{ marginRight: 10, width: 100 }}>
          Sort Order:
        </div>

        <ButtonGroup>
          <Button
            onClick={() => onChangeSortOrder("topological")}
            active={_sortOrder === "topological"}
          >
            Topological
          </Button>
          <Button
            onClick={() => onChangeSortOrder("alphabetical")}
            active={_sortOrder === "alphabetical"}
          >
            Alphabetical
          </Button>


        </ButtonGroup>
      </div>

      
    </div>
  );
}

export default Settings;
