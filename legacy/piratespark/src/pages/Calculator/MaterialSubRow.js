import React from "react";
import { Collapse } from "reactstrap";
import { formatFloat } from "./helper";
import { OddSparkEntityName, OddSparkImage } from "./Material";

const MaterialSubRow = ({
  node: node,
  isOpen: isOpen,
  idx: idx,
}) => {
  const subRowStyle = (_isOpen) => {
    const styleAll = {
      alignContent: "center",
    }
    const styleClosed = {
      height:0,
      paddingTop:0,
      paddingBottom:0,
      border:0,
    }
    return _isOpen ? styleAll : styleAll || styleClosed;
  }

  // <Collapse isOpen={isOpen} style={{
  //   width: "100%",
  //   textAlign: "right",
  // }}>
  //   {formatFloat(node.src.byMaterial[_sMaterial].netNWstn)}
  // </Collapse>

  const renderSrcWorkstation = (sMaterial) => {
    // let _shorter = false;
    // let _wstn_id = "";
    // switch (sMaterial) {
    //   case "INF":
    //     _shorter = true;
    //     _wstn_id = "INF";
    //     break;
    //   default:
    //     if(sMaterial !== "miasma" && sMaterial !== "coral") {
    //     _wstn_id = node.src.byMaterial[sMaterial].procs[0].workstation;
    //     }
    //     // todo: error if sMaterial = miasma or coral
    //     // _wstn_id = node.src.procs.find(p => p.to[0].material === node.material).workstation;
    // }
    if(!node.src.byMaterial[sMaterial].craftable) {
      return ;
    }    
    const _wstn_id = node.src.byMaterial[sMaterial].procs[0].workstation;
    return <React.Fragment>
      {/* <span> */}
      {/* {!_shorter && <span> */}
        {/* {formatFloat(node.src.byMaterial[sMaterial].netNWstn)} */}
      {/* </span>} */}
      {/* </span> */}
      <OddSparkImage
        id={_wstn_id}
        type={"workstation"}
      />
      {/* <span>{_wstn_id}</span> */}
    </React.Fragment>
  }

  const SrcRows = () => {
    return <React.Fragment>
      {node.src.allMaterials.map((_sMaterial) => <tr
        key={
          idx.toString() + node.material + '←' + _sMaterial
        }>
          <td>
          </td>
          <td>
            <div style={{
              display: 'flex',
              justifyContent: 'flex-start',
              alignItems: 'center',
            }}>
              <div>
                <OddSparkImage id={node.material} uid={node.material + idx.toString()}/>
              </div>
              <div style={{
                marginLeft: '5px',
              }}>
                ←
              </div>
              <div style={{
                marginLeft: '5px',
              }}>
                <OddSparkImage id={_sMaterial} uid={_sMaterial + idx.toString()} />
              </div>
            </div>
          </td>
          <td style={{
            textAlign: "right",
            alignContent: "center",
          }}>
              {/* {formatFloat(node.src.byMaterial[_sMaterial].netRate)} */}
              {(_sMaterial !== "INF" ) &&
                (_sMaterial !== "miasma") &&
                formatFloat(node.src.byMaterial[_sMaterial].netIpu)}
                {/* formatFloat(node.src.byMaterial[_sMaterial].netRate * node.src.byMaterial[_sMaterial].procs[0].to[0].amount)} */}
              {/* todo: error for mergedchains */}
          </td>
          <td>
          {/* <td style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
          }}> */}
            {/* todo: make height zero when collapsed */}
            {/* image fails when aether-shard selected */}
            {renderSrcWorkstation(_sMaterial)}
          </td>
          <td style={{
            textAlign: "right",
            alignContent: "center",
          }}>
            {/* <span>{node.src.byMaterial[_sMaterial].procs[0] && node.src.byMaterial[_sMaterial].procs[0].workstation}</span> */}
            {node.src.byMaterial[_sMaterial].procs[0] && <OddSparkEntityName id={node.src.byMaterial[_sMaterial].procs[0].workstation} type="workstation" />}
          </td>
          <td style={{
            textAlign: "right",
            alignContent: "center",
          }}>
            {}
            <span>{node.src.byMaterial[_sMaterial].procs[0] && formatFloat(node.src.byMaterial[_sMaterial].netNWstn)}</span>
          </td>
          <td />
          <td />
        </tr>
      )}
    </React.Fragment>
  }

const renderSrcFuelWorkstation = (sMaterial) => {
  if(!node.srcF.byMaterial[sMaterial].craftable) {
    return ;
  }    
  const _wstn_id = node.srcF.byMaterial[sMaterial].procs[0].workstation;
  return <React.Fragment>
    <OddSparkImage
      id={_wstn_id}
      type={"workstation"}
    />
  </React.Fragment>
}

const SrcFuelRows = () => {
  return <React.Fragment>
    {node.srcF.allMaterials.map((_sMaterial) => <tr
      key={
        idx.toString() + node.material + '←' + _sMaterial
      }>
        <td>
        </td>
        <td>
          <div style={{
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'center',
          }}>
            <div>
              <OddSparkImage id={node.material} uid={node.material + idx.toString()}/>
            </div>
            <div style={{
              marginLeft: '5px',
            }}>
              ←
            </div>
            <div style={{
              marginLeft: '5px',
            }}>
              <OddSparkImage id={_sMaterial} uid={_sMaterial + idx.toString()} />
            </div>
            <div>
              🔥
            </div>
          </div>
        </td>
        <td style={{
          textAlign: "right",
          alignContent: "center",
        }}>
            {(_sMaterial !== "INF" ) &&
              (_sMaterial !== "miasma") &&
              formatFloat(node.srcF.byMaterial[_sMaterial].netIpu)}
        </td>
        <td>
          {renderSrcFuelWorkstation(_sMaterial)}
        </td>
        <td style={{
          textAlign: "right",
          alignContent: "center",
        }}>
          {node.srcF.byMaterial[_sMaterial].procs[0] && <OddSparkEntityName id={node.srcF.byMaterial[_sMaterial].procs[0].workstation} type="workstation" />}
        </td>
        <td style={{
          textAlign: "right",
          alignContent: "center",
        }}>
          {}
          <span>{node.srcF.byMaterial[_sMaterial].procs[0] && formatFloat(node.srcF.byMaterial[_sMaterial].netNWstn)}</span>
        </td>
        <td />
        <td />
      </tr>
    )}
  </React.Fragment>
}
  const renderDestWorkstation = (dMaterial) => {
    // let _shorter = false;
    // let _wstn_id = "";
    // switch (dMaterial) {
    //   case "FIN":
    //     _shorter = true;
    //     _wstn_id = "FIN";
    //     break;
    //   default:
    //     // _wstn_id = node.dest.process.find(p => p.to[0].material === dMaterial).workstation;
    //     _wstn_id = node.procs[0].workstation;
    // }
    const _wstn_id = node.procs[0].workstation;
    return <React.Fragment>
      {/* <span> */}
      {/* {!_shorter && <span> */}
        {/* {formatFloat(node.dest.byMaterial[dMaterial].netNWstn)} */}
      {/* </span>} */}
      {/* </span> */}
      <OddSparkImage
        id={_wstn_id}
        uid={_wstn_id + dMaterial}
        type={"workstation"}
      />
      {/* <span>{_wstn_id}</span> */}
      {/* <span>{_wstn_id}{"("}{formatFloat(100 * node.dest.byMaterial[dMaterial].percent)}{"%)"}</span> */}
    </React.Fragment>
  }

  const DestRows = () => {
    return <React.Fragment>
      {node.dest.allMaterials.map((_dMaterial) => <tr
        key={
          idx.toString() + node.material + '→' + _dMaterial
        }>
          <td>
          </td>
          <td>
            <div style={{
              display: 'flex',
              justifyContent: 'flex-start',
              alignItems: 'center',
            }}>
              <div>
                <OddSparkImage id={node.material} uid={node.material + idx.toString()}/>
              </div>
              <div style={{
                marginLeft: '5px',
              }}>
                →
              </div>
              <div style={{
                marginLeft: '5px',
              }}>
                <OddSparkImage id={_dMaterial} uid={_dMaterial + idx.toString()}/>
              </div>
            </div>
          </td>
          <td style={{
            textAlign: "right",
            alignContent: "center",
          }}>
            {/* {formatFloat(node.dest.byMaterial[_dMaterial].netRate)} */}
            {/* {formatFloat(node.dest.byMaterial[_dMaterial].netRate * node.src.procs[0].to[0].amount)} */}
            {formatFloat(node.dest.byMaterial[_dMaterial].netIpu)}
          </td>
          <td>
          {/* <td style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
          }}> */}
            {renderDestWorkstation(_dMaterial)}
          </td>
          <td style={{
            textAlign: "right",
            alignContent: "center",
          }}>
            {/* <span>{node.procs[0].workstation}</span> */}
            <OddSparkEntityName id={node.procs[0].workstation} type="workstation" />
          </td>
          <td style={{
            textAlign: "right",
            alignContent: "center",
          }}>
            <span>{formatFloat(node.dest.byMaterial[_dMaterial].netNWstn)}</span>
          </td>
          <td style={{
            textAlign: "right",
            alignContent: "center",
          }}>
            {node.dest.byMaterial[_dMaterial].percent > 0 && formatFloat(100 * node.dest.byMaterial[_dMaterial].percent)}
          </td>
          <td />
        </tr>
      )}
    </React.Fragment> 
  }

  const renderDestFuelWorkstation = (dMaterial) => {
    const _wstn_id = node.procs[0].workstation;
    return <React.Fragment>
      <OddSparkImage
        id={_wstn_id}
        uid={_wstn_id + dMaterial}
        type={"workstation"}
      />
    </React.Fragment>
  }

  const DestFuelRows = () => {
    return <React.Fragment>
      {node.destF.allMaterials.map((_dMaterial) => <tr
        key={
          idx.toString() + node.material + '→' + _dMaterial
        }>
          <td>
          </td>
          <td>
            <div style={{
              display: 'flex',
              justifyContent: 'flex-start',
              alignItems: 'center',
            }}>
              <div>
                <OddSparkImage id={node.material} uid={node.material + idx.toString()}/>
              </div>
              <div style={{
                marginLeft: '5px',
              }}>
                →
              </div>
              <div style={{
                marginLeft: '5px',
              }}>
                <OddSparkImage id={_dMaterial} uid={_dMaterial + idx.toString()}/>
              </div>
              <div>
                🔥
              </div>
            </div>
          </td>
          <td style={{
            textAlign: "right",
            alignContent: "center",
          }}>
            {formatFloat(node.destF.byMaterial[_dMaterial].netIpu)}
          </td>
          <td>
            {renderDestFuelWorkstation(_dMaterial)}
          </td>
          <td style={{
            textAlign: "right",
            alignContent: "center",
          }}>
            <OddSparkEntityName id={node.procs[0].workstation} type="workstation" />
          </td>
          <td style={{
            textAlign: "right",
            alignContent: "center",
          }}>
            <span>{formatFloat(node.destF.byMaterial[_dMaterial].netNWstn)}</span>
          </td>
          <td style={{
            textAlign: "right",
            alignContent: "center",
          }}>
            {node.destF.byMaterial[_dMaterial].percent > 0 && formatFloat(100 * node.destF.byMaterial[_dMaterial].percent)}
          </td>
          <td />
        </tr>
      )}
    </React.Fragment> 
  }
//
const renderDestShardWorkstation = (dMaterial) => {
  const _wstn_id = node.procs[0].workstation;
  return <React.Fragment>
    <OddSparkImage
      id={_wstn_id}
      uid={_wstn_id + dMaterial}
      type={"workstation"}
    />
  </React.Fragment>
}

const DestShardRows = () => {
  return <React.Fragment>
    {node.destS.allMaterials.map((_dMaterial) => <tr
      key={
        idx.toString() + node.material + '→' + _dMaterial
      }>
        <td>
        </td>
        <td>
          <div style={{
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'center',
          }}>
            <div>
              <OddSparkImage id={node.material} uid={node.material + idx.toString()}/>
            </div>
            <div style={{
              marginLeft: '5px',
            }}>
              →
            </div>
            <div style={{
              marginLeft: '5px',
            }}>
              <OddSparkImage id={_dMaterial} uid={_dMaterial + idx.toString()}/>
            </div>
          </div>
        </td>
        <td style={{
          textAlign: "right",
          alignContent: "center",
        }}>
          {formatFloat(node.destS.byMaterial[_dMaterial].netIpu)}
        </td>
        <td>
          {renderDestShardWorkstation(_dMaterial)}
        </td>
        <td style={{
          textAlign: "right",
          alignContent: "center",
        }}>
          <OddSparkEntityName id={node.procs[0].workstation} type="workstation" />
        </td>
        <td style={{
          textAlign: "right",
          alignContent: "center",
        }}>
          <span>{formatFloat(node.destS.byMaterial[_dMaterial].netNWstn)}</span>
        </td>
        <td style={{
          textAlign: "right",
          alignContent: "center",
        }}>
          {node.destS.byMaterial[_dMaterial].percent > 0 && formatFloat(100 * node.destS.byMaterial[_dMaterial].percent)}
        </td>
        <td />
      </tr>
    )}
  </React.Fragment> 
}
//
const renderDestRootFuelWorkstation = (dMaterial) => {
  const _wstn_id = node.procs[0].workstation;
  return <React.Fragment>
    <OddSparkImage
      id={_wstn_id}
      uid={_wstn_id + dMaterial}
      type={"workstation"}
    />
  </React.Fragment>
}

const DestRootFuelRows = () => {
  return <React.Fragment>
    {node.destRF.allMaterials.map((_dMaterial) => <tr
      key={
        idx.toString() + node.material + '→' + _dMaterial
      }>
        <td>
        </td>
        <td>
          <div style={{
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'center',
          }}>
            <div>
              <OddSparkImage id={node.material} uid={node.material + idx.toString()}/>
            </div>
            <div style={{
              marginLeft: '5px',
            }}>
              →
            </div>
            <div style={{
              marginLeft: '5px',
            }}>
              <OddSparkImage id={_dMaterial} uid={_dMaterial + idx.toString()}/>
            </div>
            <div>
              🔥
            </div>
          </div>
        </td>
        <td style={{
          textAlign: "right",
          alignContent: "center",
        }}>
          {formatFloat(node.destRF.byMaterial[_dMaterial].netIpu)}
        </td>
        <td>
          {renderDestRootFuelWorkstation(_dMaterial)}
        </td>
        <td style={{
          textAlign: "right",
          alignContent: "center",
        }}>
          <OddSparkEntityName id={node.procs[0].workstation} type="workstation" />
        </td>
        <td style={{
          textAlign: "right",
          alignContent: "center",
        }}>
          <span>{formatFloat(node.destRF.byMaterial[_dMaterial].netNWstn)}</span>
        </td>
        <td style={{
          textAlign: "right",
          alignContent: "center",
        }}>
          {node.destRF.byMaterial[_dMaterial].percent > 0 && formatFloat(100 * node.destRF.byMaterial[_dMaterial].percent)}
        </td>
        <td />
      </tr>
    )}
  </React.Fragment> 
}
//
  return <React.Fragment>
    {isOpen && <SrcRows />}
    {isOpen && <SrcFuelRows />}
    {isOpen && <DestRows />}
    {isOpen && <DestFuelRows />}
    {isOpen && <DestShardRows />}
    {isOpen && <DestRootFuelRows />}
  </React.Fragment>
}

export default MaterialSubRow;