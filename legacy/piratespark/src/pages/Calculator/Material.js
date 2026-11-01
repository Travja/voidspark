import React, { useContext, useEffect, useState } from "react";
import getEntityImage from "assets/images/materials";
import getWSImage from "assets/images/workstations";
import { selectOddSpark } from "store/calculator/selector";
import { Button, ButtonGroup, PopoverBody, PopoverHeader, UncontrolledPopover } from "reactstrap";
import { useSelector } from "react-redux";
import { CalculateContext } from "./calculate";
import { formatFloat, rateStr } from "./helper";
import { useDispatch } from "react-redux";
import { changeFavoriteProcesses, changeView } from "store/actions";

export const OddSparkEntityName = ({
  id: id,
  type: type="material",
  textStyle: textStyle={},
}) => {
  const OddSpark = useSelector((state) => selectOddSpark(state));
  let name = "";
  switch (type) {
    case "material":
    case "fuel":
      name = OddSpark.material.find(m => m.id === id)?.name;
      break;
    case "workstation":
      name = OddSpark.workstation.find(w => w.id === id)?.name;
      break;
  }
  if(!name) {
    console.log('name not found', id, type);
  }
  return <span style={textStyle}>
    {name ? name : id}
  </span>
}

const AetherInfo = () => {
  const aetherSource = useSelector((state) => state.Calculator.aetherSource);
  const dispatch = useDispatch();
  const onChangeRecipe = () => {
    dispatch(changeView("settings"));
  }
  return <div style={{
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
  }}>
    Aether source:
    <div style={{
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
    }}>
      <OddSparkImage
        id={aetherSource}
        withPopover={false}
        size={25}
      />
      <OddSparkEntityName
        id={aetherSource}
        type={"material"}
        textStyle={{
          marginLeft: 8,
        }}
      />
    </div>
    <hr style={{ width: "100%" }}/>
    <Button onClick={onChangeRecipe}>
      Change Source
    </Button>
  </div>
}

const BuildInfo = ({
  id: id,
}) => {
  const calc = useContext(CalculateContext);
  const procs = calc.processTo({ material: id, sort: false });
  const spark = useSelector((state) => state.Calculator.spark);
  const favoriteProcesses = useSelector((state) => state.Calculator.favoriteProcesses);
  let favoriteProcessId = procs.find(_p => favoriteProcesses.includes(_p.id))?.id;
  if(!favoriteProcessId) {
    favoriteProcessId = procs[0]?.id;
  }
  const [selectedProcess, setSelectedProcess] = useState(procs[0]);
  useEffect(() => {
    setSelectedProcess(procs.find(_p => _p.id === favoriteProcessId));
  }, [favoriteProcessId]);
  const dispatch = useDispatch();
  const onClickAddFavorite = () => {
    const _prevFavoriteProcesses = [...favoriteProcesses].filter(_p => _p !== favoriteProcessId);
    dispatch(changeFavoriteProcesses([..._prevFavoriteProcesses, selectedProcess.id]));
  }

  const renderFavoriteButton = () => {
    if(favoriteProcessId == selectedProcess.id) {
      return <Button disabled>
        Selected
      </Button>
    } else {
      return <Button onClick={() => onClickAddFavorite()}>
        Select Recipe
      </Button>
    }
  }

  if(!procs || procs.length == 0) {
    return <div style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      alignItems: "center",
    }}>Uncraftable</div>;
  }

  return <div style={{
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
  }}>
    {procs.length > 1 && <React.Fragment>
      <ButtonGroup>
        {procs.map((_p, idx) => {
          return <Button
            key={_p.id}
            onClick={() => setSelectedProcess(_p)}
            active={_p.id === favoriteProcessId}
            >Recipe {idx + 1}</Button>
        })}
      </ButtonGroup>
      <hr style={{ width: "100%" }}/>
    </React.Fragment>}
    {selectedProcess.from.map(_f => {
      return <div key={_f.material}
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
        }}>
        <OddSparkImage
          id={_f.material}
          withPopover={false}
          size={25}
        />
        <div style={{ marginLeft: 10 }}>
          {_f.amount}&nbsp;&nbsp;x
        </div>
        <OddSparkEntityName
          id={_f.material}
          type={"material"}
          textStyle={{
            marginLeft: 8,
          }}
        />
        <div style={{
          width: 10,
          marginLeft: "auto",
        }}/>
      </div>
    })}
    {selectedProcess.from.length > 0 && <div>
      ↓
    </div>}
    {selectedProcess.from.length > 0 && selectedProcess.to.map(_t => {
      return <div key={_t.material}
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
        }}>
        <OddSparkImage
          id={_t.material}
          withPopover={false}
          size={25}
        />
        <div style={{ marginLeft: 10 }}>
          {_t.amount}&nbsp;&nbsp;x
        </div>
        <OddSparkEntityName
          id={_t.material}
          type={"material"}
          textStyle={{
            marginLeft: 8,
          }}
        />
        <div style={{
          width: 10,
          marginLeft: "auto",
        }}/>
      </div>
    })}

    {(procs[0].from.length > 0) && <hr style={{
      width: "100%",
    }}/>}
    
    <div style={{
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
    }}>
      <OddSparkImage
        id={procs[0].workstation}
        size={25}
        type="workstation"
        withPopover={false}
      />
      <OddSparkEntityName
        id={procs[0].workstation}
        type={"workstation"}
        textStyle={{
          marginLeft: 8,
        }}
      />
    </div>

    <div style={{
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      marginTop: 5,
    }}>
      <OddSparkImage
        id={spark.id}
        size={25}
        withPopover={false}
      />
      <OddSparkImage
        id={spark.id}
        size={25}
        withPopover={false}
      />
      {id != "miasma-vial" && <div style={{ marginLeft: 8 }}>
        ⌛&nbsp;{formatFloat(procs[0].buildTime / spark.speed)} sec
      </div>}
      {id == "miasma-vial" && <div style={{ marginLeft: 8 }}>
        ⌛&nbsp;{formatFloat(procs[0].buildTime)} sec
      </div>}
      
    </div>
    {id == "miasma-vial" && <div>
      (Rate limited)
    </div>}

    {procs.length > 1 && <React.Fragment>
      <hr style={{ width: "100%" }}/>
      {renderFavoriteButton()}
    </React.Fragment>}
  </div>
}

const WorkstationBuildInfo = ({
  id: id,
}) => {
  const wstn = useSelector(
    state => selectOddSpark(state)
  ).workstation.find(
    w => w.id === id
  );

  return <div style={{
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
  }}>
    {wstn.cost.map(_c => {
      return <div key={_c.id}
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
        }}>
        <OddSparkImage
          id={_c.id}
          withPopover={false}
          size={25}
        />
        <div style={{ marginLeft: 10 }}>
          {_c.amount}&nbsp;&nbsp;x
        </div>
        <OddSparkEntityName
          id={_c.id}
          type={"material"}
          textStyle={{
            marginLeft: 8,
          }}
        />
        <div style={{
          width: 10,
          marginLeft: "auto",
        }}/>
      </div>
    })}
  </div>
}

const ProcessInfoBlock = ({
  type: type,
  id: id,
}) => {
  console.log
  return <React.Fragment>
    {(id === "aether-shard") && <AetherInfo />}
    {(id != "aether-shard") && (type === "material") && <BuildInfo id={id} />}
    {(type === "workstation") && <WorkstationBuildInfo id={id} />}
  </React.Fragment>
}

const WithPopover = ({
  children: children,
  id: id,
  uid: uid,
  enable: enable=true,
  size: size=25,
  type: type="material",
  ...props
}) => {
  let imgPath = "";
  switch (type) {
    case "material":
    case "fuel":
      imgPath = getEntityImage(id);
      break;
    case "workstation":
      imgPath = getWSImage(id);
      break;
  }   
  return <React.Fragment>
    <div id={uid}>
      {children}
    </div>
    {enable && <UncontrolledPopover
      // placement="bottom"
      target={uid}
      trigger="hover"
    >
      <PopoverHeader style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <img
          src={imgPath}
          alt={id}
          width={size}
          height={size}
          style={{
            display: "block",
            overflow: "hidden",
          }}
        />
        <div style={{
          marginLeft: 8,
        }}>
          <OddSparkEntityName id={id} type={type} />
        </div>
        <div style={{
          width: 10,
          marginLeft: "auto",
        }}/>
      </PopoverHeader>
      <PopoverBody>
        <ProcessInfoBlock id={id} type={type}/>
      </PopoverBody>
    </UncontrolledPopover>}
  </React.Fragment>
}

export const OddSparkImage = ({
  id: id,
  uid: uid=id,
  size: size=30,
  type: type="material",
  style: userStyle={},
  withPopover: withPopover=true,
}) => {
  switch (id) {
    case "INF":
      // todo: add image for INF
      return <span style={{
        fontSize: size,
      }}>∞</span>;
    case "FIN":
      // todo: add image for FIN
      return <span style={{
        fontSize: size * 0.8,
      }}>⚐</span>;
  }
  let imgPath = "";
  switch (type) {
    case "material":
    case "fuel":
      imgPath = getEntityImage(id);
      break;
    case "workstation":
      imgPath = getWSImage(id);
      break;
  }
  return <WithPopover
      id={id}
      uid={uid}
      enable={withPopover}
      size={30}
      type={type}
      style={userStyle}
    >
    <img
      src={imgPath}
      alt={id}
      width={size}
      height={size}
      style={{
        display: "block",
        overflow: "hidden",
      } || userStyle }
    />
  </WithPopover>;
}