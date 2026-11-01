import React from "react";
import { List } from "reactstrap";
import logo from "../../assets/images/logo.png";

export const About = () => {
  return (<div>
    <div style={{
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-start",
      alignItems: "center",
    }}>
      <span className="logo-sm">
        <img src={logo} alt="" height="22" />
      </span>
      <div style={{ paddingLeft: 8}}>
        <h2 style={{ marginBottom: 0 }}>Pirate Spark</h2>
      </div>
    </div>
    <div style={{ paddingTop: 5, paddingLeft: 30}}>
      <h6>- An OddSparks Calculator</h6>
    </div>
    
    <div style={{ paddingTop: 30}} />

    <h6>
      Hey, OddSparks fans!
    </h6>
    <p className="mb-2">
      PirateSpark is a calculator for figuring out all the material needs in the game <a href="https://store.steampowered.com/app/1817800/Oddsparks">OddSparks: An Automation Adventure</a>.
    </p>
    <p className="mb-2">
      We've put quite some effort into making this helpful, and we're constantly improving and providing future updates.
    </p>

    <div style={{ paddingTop: 20}} />

    <h6>
      Here's what PirateSpark can do for you:
    </h6>

    <List>
      <li className="mb-2">
        <b>Detailed Calculations</b>: Breaks down exactly what materials and workstations you need at every step.
      </li>

      <li className="mb-2">
        <b>Multiple Views</b>: Toggle between table and tree views to see item hierarchies and production chains clearly.
      </li>

      <li className="mb-2">
        <b>Customizable Options</b>: Choose different sparks for workstations, pick your preferred fuel (wooden logs or coal), and tweak the process for producing aether shards.
      </li>

      <li className="mb-2">
        <b>Accurate Measurements</b>: Uses precise calculations, so you don't have to worry about errors.
      </li>

      <li className="mb-2">
        <b>Versatile Output Rates</b>: Show production rates per second, minute, or hour to fit your needs.
      </li>
    </List>

    <div style={{ paddingTop: 10}} />

    <p className="mb-2">
      We hope PirateSpark can make your OddSparks gameplay a bit smoother and even more enjoyable.
    </p>

    <p className="mb-2">
      Happy gaming!
    </p>

    <div style={{ paddingTop: 10}} />

    <p className="mb-2">
      - PirateSpark Team
    </p>

    <div style={{ paddingTop: 10}} />

    
    <div style={{ paddingTop: 20}} />

    <h6>Release notes</h6>
    <div style={{ paddingTop: 8}}>
      <p className="mb-2">
        <b>Version 0.1.0</b> - Initial release
      </p>
    </div>

    <div style={{ paddingTop: 8}}>
      <p className="mb-2">
        <b>Version 0.2.0</b> - Trains & Trades update
      </p>
      <ul>
        <li>
          New items: Added support for the Trains & Trades update, including paints and sparks. 
        </li>
        <li>
          Fuel adjustment: You can now choose between different fuel types, and the calculator will adjust material requirements accordingly.
        </li>
        <li>
          Spark speed fix: spark speed now reflects correctly.
        </li>
      </ul>
      Special Thanks: OddSparks devs for your tremendous support!
    </div>
    
    <div style={{ paddingTop: 8}}>
      <p className="mb-2">
        <b>Version 0.2.1</b> - Alternate recipes
      </p>
      <ul>
        <li>
          Alternate Recipe: Options added for more efficient recipe.
        </li>
        <li>
          New "Workstation" feature: New tab for a summary of workstations and materials needed.
        </li>
        <li>
          Miasma collector fix: Adjusted rate limits for accurate calculations.
        </li>
        <li>
          Default settings: Updated to use the most common settings.
        </li>
      </ul>
      Special Thanks: <a href="https://discordapp.com/users/540517821029941248">@Prometheus0000</a> and <a href="https://discordapp.com/users/765867454924324875">@Cesium30</a> for your suggestions!
    </div>

    <div style={{ paddingTop: 8}}>
      <p className="mb-2">
        <b>Version 0.2.3</b> - Bug Fix
      </p>
      <ul>
        <li>
          Fixed a bug where the number of miasma collectors was not being calculated correctly.
        </li>
        <li>
          Updated recipe for small vial.
        </li>
        <li>
          Miasma collector fix: Adjusted rate limits for accurate calculations.
        </li>
      </ul>
    </div>

    <div style={{ paddingTop: 20}} />


    <h6>Got questions or feedback? </h6>
    <p className="mb-2">
      Feel free to message us through our Discord!
    </p>
    <ul>
      <li>
        <a href="https://discordapp.com/users/328128384720699392">@FastInfinite</a>
      </li>
      <li>
        <a href="https://discordapp.com/users/358917483584946186">@doubgun</a>
      </li>
    </ul>
    
    <div style={{ paddingTop: 20}} />
  </div>);
}

export default About;
