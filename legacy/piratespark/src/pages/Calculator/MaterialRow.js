import React, { useState } from "react";
import { OddSparkImage, OddSparkEntityName, } from "./Material";
import { formatFloat } from "./helper";
import MaterialSubRow from "./MaterialSubRow";

const MaterialRow = ({
  node: node,
  idx: idx,
  ...rest
}) => {
  const [isOpen, setIsOpen] = useState(true);

  return (<React.Fragment>
    <tr>
      <td style={{
        width: 50,
        alignContent: "center",
      }}>
        <div style={{
          display: "flex",
          flexDirection: "row",
        }}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)} 
            className="btn"
            style={{
              marginRight: 0,
              marginLeft: 0,
              padding: 0,
            }}
          >
            {/* chevron */}
            <i className="bx bx-chevron-right"
              style={{
                transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.5s",
                fontSize: 20,
              }} />
          </button>
          <OddSparkImage id={node.material} uid={'r' + node.material + idx.toString()}/>
        </div>
      </td>
      <td style={{ alignContent: "center" }}>
        <OddSparkEntityName id={node.material} />
      </td>
      {/* <td>{OddSpark.material[node.material].name}</td> */}
      <td style={{
        textAlign: "right",
        alignContent: "center",
      }}>
        {formatFloat(node.dest.netIpu)}
      </td>
      <td>
        <OddSparkImage
            // id={node.src.procs[0].workstation}
            id={node.procs[0].workstation}
            type={"workstation"}
          />
      </td>
      <td style={{
        textAlign: "right",
        alignContent: "center",
        // display: "flex",
        // flexDirection: "row",
        // alignItems: "center",
        // justifyContent: "flex-end",
      }}>
        {/* &nbsp;&nbsp;&nbsp;X&nbsp;&nbsp; */}
        {/* <span>{node.src.procs[0].workstation}</span> */}
        <OddSparkEntityName id={node.procs[0].workstation} type="workstation" />
      </td>
      <td style={{
        textAlign: "right",
        alignContent: "center",
      }}>
        <span>{formatFloat(node.dest.netNWstn)}</span>
      </td>
      <td style={{
        textAlign: "right",
        alignContent: "center",
      }}>
        {node.hasDest && 100}
      </td>
      <td />
    </tr>

    <MaterialSubRow 
      isOpen={isOpen}
      node={node}
      idx={idx}
    />
  </React.Fragment>);
}

export default MaterialRow;
