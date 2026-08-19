import { forceSimulation, forceLink, forceManyBody, forceCollide, forceCenter, forceX, forceY } from "d3-force";
import { untangle, countCrossings } from "./src/lib/untangle.ts";
function run(nPeople, nCross, nHubs, seed) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const people = Array.from({length:nPeople},(_,i)=>`p${i}`);
  const hubs = Array.from({length:nHubs},(_,i)=>`h${i}`);
  const nodes = [{id:"you"},...people.map(id=>({id})),...hubs.map(id=>({id}))];
  const links = people.map(id=>({source:"you",target:id}));
  for (let i=0;i<nCross;i++){
    const a = people[Math.floor(rnd()*nPeople)], b = people[Math.floor(rnd()*nPeople)];
    if (a!==b) links.push({source:a,target:b});
  }
  for (const h of hubs) for (const p of people) if (rnd()<0.25) links.push({source:p,target:h});
  const sim = forceSimulation(nodes.map(n=>({...n})))
    .force("link", forceLink(links.map(l=>({...l}))).id(d=>d.id).distance(135))
    .force("charge", forceManyBody().strength(-340))
    .force("collide", forceCollide().radius(50).strength(0.9).iterations(2))
    .force("center", forceCenter(240,300).strength(1))
    .force("x", forceX(240).strength(0.04)).force("y", forceY(300).strength(0.04)).stop();
  const ns = sim.nodes(); const you = ns.find(n=>n.id==="you"); you.fx=240; you.fy=300;
  for (let i=0;i<400;i++) sim.tick();
  const layout = ns.map(n=>({id:n.id,x:n.x,y:n.y,fixed:n.id==="you"}));
  const edges = links.map(l=>({source:l.source,target:l.target}));
  const before = countCrossings(layout, edges);
  const t0=performance.now(); const r = untangle(layout, edges); const ms=performance.now()-t0;
  // verify the returned positions really are a permutation of the input slots
  const inSlots = layout.map(n=>`${n.x.toFixed(4)},${n.y.toFixed(4)}`).sort().join("|");
  const out = layout.map(n=>{const p=r.positions.get(n.id); return p?`${p.x.toFixed(4)},${p.y.toFixed(4)}`:`${n.x.toFixed(4)},${n.y.toFixed(4)}`;}).sort().join("|");
  console.log(`people=${String(nPeople).padStart(3)} edges=${String(edges.length).padStart(3)} seed=${seed}  ${String(before).padStart(4)} → ${String(r.after).padStart(4)} crossings  ${ms.toFixed(1).padStart(6)}ms  permutation=${inSlots===out} regressed=${r.after>before}`);
}
for (const seed of [1,7,42]) { run(16,6,2,seed); run(30,12,3,seed); run(60,25,4,seed); run(100,40,5,seed); }
