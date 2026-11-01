import React from "react";
import { formatFloat, rateStr } from "./helper";
import { OddSparkImage } from "./Material";
import getEntityImage from "assets/images/materials";
import { useSelector } from "react-redux";


const MaterialTreeNode = ({
  node: node,
  OddSpark: OddSpark,
}) => {
  const fuel = useSelector((state) => state.Calculator.fuel);
  const checkRootOfFT = (node) => {
    if(node.isRootOfFT) {
      return "🔥";
    }
    return "⬦";
  }
  const fuelImage = (node) => {
    if (!node.proc.fuelRequired) {
      return [];
    }
    return getEntityImage(fuel.id);
  };
  const fuelString = (node) => {
    if (!node.proc.fuelRequired) {
      return "";
    }
    return "🔥" + formatFloat(node.timeScale * fuel.amount * node.nWstn) + " " + rateStr();
  };

  return <div style={{
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
  }}>
    <span>
      {checkRootOfFT(node)}&nbsp;
    </span>

    <OddSparkImage id={node.proc.to[0].material} uid={'node' + node.proc.to[0].material}/>

    <div style={{ marginLeft: 10 }}>
      {formatFloat(node.rate * node.proc.to[0].amount)} {rateStr()}
    </div>
    <div style={{ marginLeft: 10 }}>
      {OddSpark.material[node.proc.to[0].material] && OddSpark.material[node.proc.to[0].material].name}
    </div>
    <div style={{
      marginLeft: 2,
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
    }}>
      <span>
      | 
      </span>
      <span style={{
        marginLeft: 8,
      }}>
        <OddSparkImage id={node.proc.workstation} type={"workstation"} uid={'node' + node.proc.workstation}/>
      </span>
      <span>
        &nbsp;X&nbsp;&nbsp;{formatFloat(node.nWstn)}
      </span>
      <span>
        {(fuelImage(node).length !== 0) && <div style={{
          marginLeft: 8,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
        }}>
          |&nbsp;&nbsp;
          <OddSparkImage id={fuel.id} uid={'node-fuel' + fuel.id}/>      
          {/* <OddSparkImage id={fuel.id} type={"fuel"} uid={'node-fuel' + fuel.id}/>         */}
          </div>}
      </span>
      <span>
         {fuelString(node)}
      </span>
    </div>
    
  </div>
}

export default MaterialTreeNode;
