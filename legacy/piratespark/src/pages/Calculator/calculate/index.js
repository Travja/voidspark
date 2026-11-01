import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { Process, processTo } from "./proc";
import { accumulate, plantRootsSeperately } from "./chain";
import { appendAetherNode, makeAetherSampleTree } from "./aether";
import { appendMiasmaNode, makeMiasmaSampleTree } from "./miasma";
import { uniteFuelTree } from "./fuel";
import { selectOddSpark } from "store/calculator/selector";
import { Workstation } from "./wstn";
export * from "./proc";
export * from "./aether";


export const CalculateContext = React.createContext({
  processJson: '',
  allProcesses: '',
  allFuels: '',
  allWorkstations: '',
  processTo: () => {},
  plantRootsSeperately: () => {},
  appendAetherNode: () => {},
  appendMiasmaNode: () => {},
  accumulate: () => {},
  uniteFuelTree: () => {},
});

const CalculateCore = props => {
  const processJson = useSelector(state => state.Calculator.oddspark.process);
  const allProcesses = processJson.map(
    _p => Process.fromJSON(_p)
  );
  const workstationJson = useSelector(state => state.Calculator.oddspark.workstation);
  const allWorkstations = workstationJson.map(
    _w => Workstation.fromJSON(_w)
  );
  const favoriteProcesses = useSelector((state) => state.Calculator.favoriteProcesses);
  const sparkSpeed = useSelector(state => state.Calculator.spark.speed);
  const aetherSource = useSelector((state) => state.Calculator.aetherSource);
  const fuel = useSelector((state) => state.Calculator.fuel);
  const ipuId = useSelector((state) => state.Calculator.rateDisplay).id;
  const OddSpark = useSelector((state) => selectOddSpark(state));
  const sortOrder = useSelector((state) => state.Calculator.sortOrder);
  const ignoreMaterials = [];
  switch(aetherSource) {
    case 'aether-shard':
      ignoreMaterials.push('raw-aether', 'refined-aether');
      break;
    case 'aetheric-pellet':
      ignoreMaterials.push('aetheric-pellet');
      break;
    case 'aetheric-clump':
      ignoreMaterials.push('aetheric-clump');
      break;
  }

  let timeScale = 1;
  switch (ipuId) {
    case 'ips':
      timeScale = 1/60;
      break;
    case 'iph':
      timeScale = 60;
    default:
      break; 
  }

  const _processTo = ({...kwargs}) => processTo({
    processes: allProcesses,
    favoriteProcesses: favoriteProcesses,
    ...kwargs,
  });

  const _plantRootsSeperately = ({...kwargs}) => plantRootsSeperately({
    processes: allProcesses,
    favoriteProcesses: favoriteProcesses,
    sparkSpeed: sparkSpeed,
    timeScale: timeScale,
    aetherSource: aetherSource,
    fuel: fuel,
    ...kwargs,
  });

  const _appendAetherNode = ({...kwargs}) => appendAetherNode({
    aetherTree: makeAetherSampleTree({
      processes: allProcesses,
      favoriteProcesses: favoriteProcesses,
      aetherSource: aetherSource,
      sparkSpeed: sparkSpeed,
      timeScale: timeScale,
    }),
    sparkSpeed: sparkSpeed,
    timeScale: timeScale,
    ...kwargs,
  });

  const _appendMiasmaNode = ({...kwargs}) => appendMiasmaNode({
    miasmaTree: makeMiasmaSampleTree({
      processes: allProcesses,
      favoriteProcesses: favoriteProcesses,
      sparkSpeed: sparkSpeed,
      timeScale: timeScale,
    }),
    sparkSpeed: sparkSpeed,
    timeScale: timeScale,
    ...kwargs,
  });

  const _accumulate = ({...kwargs}) => accumulate({
    processes: allProcesses,
    favoriteProcesses: favoriteProcesses,
    miasmaTree: makeMiasmaSampleTree({
      processes: allProcesses,
      favoriteProcesses: favoriteProcesses,
    }),
    sparkSpeed: sparkSpeed,
    timeScale: timeScale,
    OddSpark: OddSpark,
    sortOrder: sortOrder,
    ignoreMaterials: ignoreMaterials,
    fuel: fuel,
    allWorkstations: allWorkstations,
    ...kwargs,
  });

  const _uniteFuelTree = ({...kwargs}) => uniteFuelTree({
    processes: allProcesses,
    favoriteProcesses: favoriteProcesses,
    sparkSpeed: sparkSpeed,
    timeScale: timeScale,
    fuel: fuel,
    ...kwargs,
  });
  
  const contextValue = useMemo(() => ({
    processJson: processJson,
    allProcesses: allProcesses,
    allWorkstations: allWorkstations,
    processTo: _processTo,
    plantRootsSeperately: _plantRootsSeperately,
    appendAetherNode: _appendAetherNode,
    appendMiasmaNode: _appendMiasmaNode,
    accumulate: _accumulate,
    uniteFuelTree: _uniteFuelTree,
  }), [processJson, allProcesses]);

  return (<CalculateContext.Provider
    value={contextValue}
  >
    {props.children}
  </CalculateContext.Provider>);
}

export default CalculateCore;
