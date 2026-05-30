"use strict";

/* ============================ LKW-Daten (mm) ============================ */
const DEFAULT_TRUCKS = {
  "Kühler":             {l:13300, w:2400, h:2600},
  "Plane":              {l:13600, w:2450, h:2650},
  "Motorwagen Wenzel":  {l:7200,  w:2450, h:2500},
  "Motorwagen Tüske":   {l:8000,  w:2450, h:2700},
};
let TRUCKS = {};
let currentTruck = "Plane";
const settings = { showCrosshair: true, lang: "de" };
const cloneDefaults = () => JSON.parse(JSON.stringify(DEFAULT_TRUCKS));
function loadConfig(){
  try{
    const t = JSON.parse(localStorage.getItem("lkwPlaner.trucks"));
    TRUCKS = (t && typeof t==="object" && Object.keys(t).length) ? t : cloneDefaults();
  }catch(_){ TRUCKS = cloneDefaults(); }
  try{
    const s = JSON.parse(localStorage.getItem("lkwPlaner.settings"));
    if(s && typeof s==="object") Object.assign(settings, s);
  }catch(_){}
  if(!TRUCKS[currentTruck]) currentTruck = Object.keys(TRUCKS)[0] || "Plane";
}
function saveTrucks(){ try{ localStorage.setItem("lkwPlaner.trucks", JSON.stringify(TRUCKS)); }catch(_){} }
function saveSettings(){ try{ localStorage.setItem("lkwPlaner.settings", JSON.stringify(settings)); }catch(_){} }
loadConfig();
