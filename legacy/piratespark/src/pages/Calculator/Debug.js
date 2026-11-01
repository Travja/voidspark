import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, Container, Table } from "reactstrap";
import { OddSparkImage } from "./Material";
import { useSelector } from "react-redux";
import { selectOddSpark } from "store/calculator/selector";
import { tsort } from "./dev";
import Frame from "./Frame";


const Debug = () => {
  const navigate = useNavigate();
  document.title = "Pirate Spark | Debug";
  const OddSpark = useSelector((state) => selectOddSpark(state));

  const _validate = (value) => {
    if (value === null || value === undefined || value === "") {
      return "-";
    }
    return value;
  }

  const renderAndPadCols = (data, col_names, numCols) => {
    let _cols = [];
    
    data && data.map((_d) => {
      col_names.map((_c) => {
        _cols.push(_validate(_d[_c]));
      });
    });
    while (_cols.length < numCols * col_names.length) {
      _cols.push(_validate(""));
    }

    return _cols;
  }

  const DebugSparks = () => {
    return <Table striped bordered>
      <tbody>
        <tr>
          <th>img</th>
          <th>id</th>
          <th>name</th>
          <th>speed</th>
        </tr>
        {OddSpark.spark.map((m) => {
          return <tr key={m.id}>
            <td>
              <OddSparkImage id={m.block} size={15} uid={m.block}/>
            </td>
            <td>{_validate(m.id)}</td>
            <td>{_validate(m.name)}</td>
            <td>{_validate(m.speed)}</td>
          </tr>
        })}
      </tbody>
    </Table>
  };

  const DebugCategories = () => {
    return <Table striped bordered>
      <tbody>
        <tr>
          <th>id</th>
          <th>name</th>
        </tr>
        {OddSpark.category.map((m) => {
          return <tr key={m.id}>
            <td>{_validate(m.id)}</td>
            <td>{_validate(m.name)}</td>
          </tr>
        })}
      </tbody>
    </Table>
  };

  const DebugWorkstations = () => {
    return <Table striped bordered>
      <tbody>
        <tr>
          <th>category</th>
          <th>id</th>
          <th>name</th>
          <th>c0</th>
          <th>#</th>
          <th>c1</th>
          <th>#</th>
          <th>c2</th>
          <th>#</th>
          <th>c3</th>
          <th>#</th>
        </tr>
        {OddSpark.workstation.map((p) => {
          return <tr key={p.name}>
            <td>{_validate(p.category)}</td>
            <td>{_validate(p.id)}</td>
            <td>{_validate(p.name)}</td>
            {renderAndPadCols(p.cost, ["id", "amount"], 4)
              .map((_c, idx) => {
                return <td key={_c + idx.toString()}>{_c}</td>;
            })}
          </tr>;
        })}
      </tbody>
    </Table>
  };

  let _images = OddSpark.material.map(x => {
    if (x.category === OddSpark.category[1].id) {
      return [x.id, x.category];
    }
  })

  const DebugMaterials = () => {
    return <Table striped bordered>
      <tbody>
        <tr>
          <th>img</th>
          <th>category</th>
          <th>id</th>
          <th>name</th>
        </tr>
        {OddSpark.material.map((m) => {
          return <tr key={m.id}>
            <td>
              <OddSparkImage id={m.id} size={15} uid={m.id}/>
            </td>
            <td>{_validate(m.category)}</td>
            <td>{_validate(m.id)}</td>
            <td>{_validate(m.name)}</td>
            {/* <td>{_images}</td> */}
          </tr>
        })}
      </tbody>
    </Table>
  };

  const DebugProcesses = () => {
    return <Table striped bordered>
      <tbody>
        <tr>
          <th>name</th>
          <th>workstation</th>
          <th>build_time</th>
          <th>f0</th>
          <th>#</th>
          <th>f1</th>
          <th>#</th>
          <th>t0</th>
          <th>#</th>
          <th>t1</th>
          <th>#</th>
          <th>f1</th>
          <th>#</th>
          <th>f2</th>
          <th>#</th>
        </tr>
        {OddSpark.process.map((p) => {
          return <tr key={p.name}>
            <td>{_validate(p.name)}</td>
            <td>{_validate(p.workstation)}</td>
            <td>{_validate(p.buildTime)}</td>
            {renderAndPadCols(p.from, ["material", "amount"], 2)
              .map((_c, idx) => {
                return <td key={_c + idx.toString()}>{_c}</td>;
            })}
            {renderAndPadCols(p.to, ["material", "amount"], 2)
              .map((_c, idx) => {
                return <td key={_c + idx.toString()}>{_c}</td>;
            })}
            {renderAndPadCols(p.fuel, ["material", "amount"], 2)
              .map((_c, idx) => {
                return <td key={_c + idx.toString()}>{_c}</td>;
            })}
          </tr>;
        })}
      </tbody>
    </Table>
  };

  const generateMaterialTsort = () => {
    let ignore = [
      "raw-aether",
      "refined-aether"
    ];
    let edges = [];
    OddSpark.process.map((p) => {
      p.from.map((_f) => {
        p.to.map((_t) => {
          if(
            ignore.indexOf(_f.material) >= 0 ||
            ignore.indexOf(_t.material) >= 0
          ) {
            return;
          }
          edges.push([_f.material, _t.material]);
        });
      });
    });
    // console.log(edges);
    const sorted = tsort(edges).reverse();
    console.log('Materials (Topologically Sorted):', sorted);
    return sorted;
  }

  const generateProcessTsort = () => {
    const ignore = [
      "raw-distillation",
      "refined-distillation"
    ]
    const materialSorted = generateMaterialTsort();
    const _sortProcess = (a, b) => {
      return materialSorted.indexOf(a.to[0]) -
        materialSorted.indexOf(b.to[0]);
    }
    const processesSorted = [...OddSpark.process]
      .filter(p => { return ignore.indexOf(p.id) < 0; })
      .sort(_sortProcess)
      .reverse();
    const processSortedIds = processesSorted.map(p => p.id);
    console.log('Processes (Topologically Sorted):', processSortedIds)
    return processSortedIds;
  }

  return (<React.Fragment>
    {/* <div className="page-content"> */}
    <Frame>
      <Container fluid>
        <h1>Debug</h1>
        <div style={{
          marginTop: "20px",
          marginBottom: "20px",
          display: "flex",
          flexDirection: "row",
          justifyContent: "flex-start",
        }}>
          <Button
            color="primary"
            onClick={() => {
              navigate("/");
          }}>
            Back to Calculator
          </Button>

          <Button
            color="primary"
            style={{
              marginLeft: "5px",
            }}
            onClick={generateMaterialTsort}
          >
            Tsort(Material)
          </Button>

          <Button
            color="primary"
            style={{
              marginLeft: "5px",
            }}
            onClick={generateProcessTsort}
          >
            Tsort(Process)
          </Button>
        </div>

        <h2>Sparks</h2>
        <DebugSparks />
        
        <h2>Categories</h2>
        <DebugCategories />
        
        <h2>Workstations</h2>
        <DebugWorkstations />
        
        <h2>Materials</h2>
        <DebugMaterials />

        <h2>Processes</h2>
        <DebugProcesses />

      </Container>
    {/* </div> */}
    </Frame>
  </React.Fragment>);
};

export default Debug;
