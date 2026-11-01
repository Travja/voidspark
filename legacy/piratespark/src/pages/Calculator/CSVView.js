import React from "react";
import { useSelector } from "react-redux";
import { Button } from "reactstrap";
import { selectOddSpark } from "store/calculator/selector";
import { json2csv } from 'json-2-csv';


const CSVView = () => {
  const OddSpark = useSelector((state) => selectOddSpark(state));
  const csv = json2csv(OddSpark);
  const file = new Blob([csv], { type: 'text/csv' });
  return <div>
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ marginLeft: "auto", marginRight: 0 }}>
        <Button color="primary" size="sm">
          <a download="sample.csv"
            target="_blank"
            rel="noreferrer"
            href={URL.createObjectURL(file)}
            style={{
                textDecoration: "inherit",
                color: "inherit",
            }}
          >
            Download
          </a>
        </Button>
      </div>
    </div>
    <div>
      <textarea
        style={{
          width: "100%",
          height: "400px",
        }}
        value={csv}
        readOnly={true}
      />
    </div>
  </div>
}

export default CSVView;
