const SCHOOLS = [
  { name: "School of Medicine", className: "school-wide", colors: ["#ad4d5d"], departments: [
    "Biomedical Informatics & Data Science", "Cardiovascular Medicine", "General Internal Medicine",
    "Immunobiology", "Molecular Biophysics & Biochemistry", "Neuroscience", "Pathology",
    "Psychiatry", "Radiology & Biomedical Imaging",
  ] },
  { name: "Faculty of Arts & Sciences", className: "school-wide", colors: [
    "#287553", "#398361", "#4a916d", "#2d806d", "#579874", "#367a5b", "#648c53", "#43896d",
  ], departments: [
    "Astronomy", "Economics", "Mathematics", "Physics", "Political Science", "Psychology",
    "Sociology", "Statistics & Data Science",
  ] },
  { name: "School of Engineering & Applied Science", displayName: "School of Engineering", colors: ["#225e9a", "#3175ab", "#4188ba", "#547db5"], departments: [
    "Applied Physics", "Biomedical Engineering", "Computer Science", "Electrical & Computer Engineering",
  ] },
  { name: "School of Public Health", colors: ["#7956a4", "#9672b5"], departments: [
    "Biostatistics", "Health Policy & Management",
  ] },
  { name: "School of Management", colors: ["#a37a29", "#bb9235"], departments: [
    "Marketing", "Operations (Yale School of Management)",
  ] },
];

const DEPARTMENT_LABELS = new Map(Object.entries({
  "Applied Physics": "AP", "Astronomy": "Astro", "Biomedical Engineering": "BME",
  "Biomedical Informatics & Data Science": "BIDS", "Biostatistics": "Biostats",
  "Cardiovascular Medicine": "Cardio", "Computer Science": "CS", "Economics": "Econ",
  "Electrical & Computer Engineering": "ECE", "General Internal Medicine": "GIM",
  "Health Policy & Management": "HPM", "Immunobiology": "Imm.", "Marketing": "Mktg",
  "Mathematics": "Math", "Molecular Biophysics & Biochemistry": "MBB", "Neuroscience": "Neuro",
  "Operations (Yale School of Management)": "Ops", "Pathology": "Path",
  "Physics": "Phys", "Political Science": "Pol", "Psychiatry": "Psych",
  "Psychology": "Psy", "Radiology & Biomedical Imaging": "Rad", "Sociology": "Soc",
  "Statistics & Data Science": "S&DS",
}));
const shortDepartment = (name) => DEPARTMENT_LABELS.get(name) || name;

const $ = (selector) => document.querySelector(selector);
const make = (tag, className = "", text = "") => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
};
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};
const paperDate = (value) => {
  if (!value) return "Date unavailable";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date);
};
const appendPaperLink = (parent, paper, label = paper.title) => {
  const url = safeUrl(paper.url);
  const element = make(url ? "a" : "span", "", label);
  if (url) {
    element.href = url;
    element.target = "_blank";
    element.rel = "noopener noreferrer";
  }
  parent.append(element);
  return element;
};

async function start() {
  try {
    const data = window.FDS_ATLAS_DATA;
    if (!data) throw new Error("Bundled data did not load");
    const facultyByName = new Map(data.faculty.map((person) => [person.name, person]));
    const papersById = new Map(data.papers.map((paper) => [paper.id, paper]));
    const departmentColor = new Map(SCHOOLS.flatMap((school) => school.departments.map((name, index) => [
      name, school.colors[index % school.colors.length],
    ])));
    if (departmentColor.size !== data.departments.length || data.departments.some((name) => !departmentColor.has(name))) {
      throw new Error("School groupings do not cover each department exactly once");
    }
    const selectedDepartments = new Set(data.departments);
    let updateNetworkDepartments = () => {};

    $("#stat-faculty").textContent = data.metadata.facultyCount.toLocaleString();
    $("#stat-pairs").textContent = data.metadata.pairCount.toLocaleString();
    $("#stat-papers").textContent = data.metadata.paperCount.toLocaleString();
    $("#stat-cross").textContent = data.metadata.crossDepartmentPairCount.toLocaleString();
    renderLegend(data, departmentColor, selectedDepartments, () => updateNetworkDepartments());
    const updatePairs = () => renderPairs(data, facultyByName);
    const updatePapers = () => renderBibliography(data);
    $("#pairs-hide-within").addEventListener("change", updatePairs);
    $("#pair-search").addEventListener("input", updatePairs);
    $("#bibliography-hide-within").addEventListener("change", updatePapers);
    $("#paper-search").addEventListener("input", updatePapers);
    updatePairs();
    updatePapers();

    try {
      const d3 = window.d3;
      if (!d3) throw new Error("Bundled D3 did not load");
      updateNetworkDepartments = drawNetwork(d3, data, facultyByName, papersById, departmentColor, selectedDepartments);
      updateNetworkDepartments();
      $("#network-status").hidden = true;
    } catch (error) {
      $("#network-status").textContent = "The network library could not load. The complete pair table and bibliography are available below.";
      console.error("Network initialization failed:", error);
    }
  } catch (error) {
    $("#network-status").textContent = "The site data could not load. Check that all files from the fds-atlas folder are present.";
    $("#pair-results").textContent = "Data unavailable";
    $("#paper-results").textContent = "Data unavailable";
    console.error("Site data failed to load:", error);
  }
}

function renderLegend(data, departmentColor, selectedDepartments, onChange) {
  const counts = new Map(data.departments.map((name) => [name, 0]));
  for (const person of data.faculty) {
    for (const department of person.departments) counts.set(department, (counts.get(department) || 0) + 1);
  }
  const departmentInputs = new Map();
  const schoolInputs = new Map();
  const updateCount = () => {
    $("#legend-count").textContent = `${selectedDepartments.size} of ${data.departments.length} selected`;
    for (const school of SCHOOLS) {
      const selected = school.departments.filter((name) => selectedDepartments.has(name)).length;
      const input = schoolInputs.get(school.name);
      input.checked = selected === school.departments.length;
      input.indeterminate = selected > 0 && selected < school.departments.length;
    }
    onChange();
  };
  const fragment = document.createDocumentFragment();
  for (const school of SCHOOLS) {
    const group = make("div", `school-group ${school.className || ""}`);
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", school.name);
    group.style.borderTopColor = school.colors[0];
    const heading = make("label", "school-heading");
    heading.title = school.name;
    const schoolCheckbox = make("input");
    schoolCheckbox.type = "checkbox";
    schoolCheckbox.checked = true;
    schoolCheckbox.setAttribute("aria-label", `Show all ${school.name} departments in network`);
    schoolCheckbox.addEventListener("change", () => {
      for (const name of school.departments) {
        if (schoolCheckbox.checked) selectedDepartments.add(name);
        else selectedDepartments.delete(name);
        departmentInputs.get(name).checked = schoolCheckbox.checked;
      }
      updateCount();
    });
    heading.append(schoolCheckbox, make("strong", "", school.displayName || school.name));
    schoolInputs.set(school.name, schoolCheckbox);
    group.append(heading);
    const list = make("div", "school-departments");
    for (const name of school.departments) {
      const row = make("label", "legend-item");
      row.title = `${name} · ${counts.get(name)} faculty`;
      const checkbox = make("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.setAttribute("aria-label", `Show ${name} in network`);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedDepartments.add(name);
        else selectedDepartments.delete(name);
        updateCount();
      });
      const deptSwatch = make("span", "legend-swatch");
      deptSwatch.style.background = departmentColor.get(name);
      row.append(checkbox, deptSwatch, make("span", "", shortDepartment(name)));
      list.append(row);
      departmentInputs.set(name, checkbox);
    }
    group.append(list);
    fragment.append(group);
  }
  $("#department-legend").replaceChildren(fragment);
  for (const [selector, checked] of [["#departments-select-all", true], ["#departments-deselect-all", false]]) {
    $(selector).addEventListener("click", () => {
      selectedDepartments.clear();
      if (checked) data.departments.forEach((name) => selectedDepartments.add(name));
      departmentInputs.forEach((input) => { input.checked = checked; });
      updateCount();
    });
  }
  updateCount();
}

function renderPairs(data, facultyByName) {
  const hideWithin = $("#pairs-hide-within").checked;
  const query = $("#pair-search").value.trim().toLocaleLowerCase();
  const visible = data.pairs.filter((pair) => {
    if (hideWithin && pair.withinDepartment) return false;
    if (!query) return true;
    const source = facultyByName.get(pair.source);
    const target = facultyByName.get(pair.target);
    return [pair.source, pair.target, ...(source?.departments || []), ...(target?.departments || [])]
      .join(" ").toLocaleLowerCase().includes(query);
  });
  const fragment = document.createDocumentFragment();
  for (const pair of visible) {
    const source = facultyByName.get(pair.source);
    const target = facultyByName.get(pair.target);
    const row = make("tr");
    const cells = [
      [pair.source, "faculty-cell"],
      [(source?.departments || []).join(" / "), "dept-cell"],
      [pair.target, "faculty-cell"],
      [(target?.departments || []).join(" / "), "dept-cell"],
      [String(pair.count), "count-cell"],
      [pair.firstYear, ""],
      [pair.lastYear, ""],
    ];
    for (const [text, className] of cells) row.append(make("td", className, text));
    const relationship = make("td");
    relationship.append(make("span", `type-badge${pair.withinDepartment ? " within" : ""}`, pair.withinDepartment ? "Within department" : "Cross department"));
    row.append(relationship);
    fragment.append(row);
  }
  if (!visible.length) {
    const row = make("tr");
    const cell = make("td", "empty", "No pairs match the current filters.");
    cell.colSpan = 8;
    row.append(cell);
    fragment.append(row);
  }
  $("#pairs-body").replaceChildren(fragment);
  $("#pair-results").textContent = `${visible.length} of ${data.pairs.length} pairs`;
}

function renderBibliography(data) {
  const hideWithin = $("#bibliography-hide-within").checked;
  const query = $("#paper-search").value.trim().toLocaleLowerCase();
  const visible = data.papers.filter((paper) => {
    if (hideWithin && !paper.crossDepartment) return false;
    if (!query) return true;
    return [paper.title, paper.venue, paper.type, ...paper.faculty, ...paper.authors]
      .join(" ").toLocaleLowerCase().includes(query);
  });
  const fragment = document.createDocumentFragment();
  let currentYear = "";
  for (const paper of visible) {
    if (paper.year !== currentYear) {
      currentYear = paper.year;
      fragment.append(make("h3", "year-heading", currentYear || "Undated"));
    }
    const article = make("article", "bib-item");
    const topline = make("div", "bib-topline");
    const date = make("time", "", paperDate(paper.latestDate));
    date.dateTime = paper.latestDate;
    topline.append(date, make("span", `type-badge${paper.crossDepartment ? "" : " within"}`, paper.crossDepartment ? "Cross department" : "Within department"));
    const heading = make("h3");
    appendPaperLink(heading, paper);
    article.append(topline, heading);
    const authorNames = paper.authors.length ? paper.authors : paper.faculty;
    const authorFaculty = paper.authors.length ? paper.authorFaculty || [] : paper.faculty;
    const authorLine = make("p", "bib-authors");
    authorNames.forEach((name, index) => {
      if (index) authorLine.append(document.createTextNode(", "));
      const faculty = authorFaculty[index];
      authorLine.append(faculty ? make("strong", "fds-author", name) : document.createTextNode(name));
    });
    const matched = new Set(authorFaculty.filter(Boolean));
    for (const name of paper.faculty.filter((faculty) => !matched.has(faculty))) {
      if (authorLine.childNodes.length) authorLine.append(document.createTextNode(", "));
      const addition = make("strong", "fds-author", name);
      addition.title = "Confirmed FDS coauthor omitted from the selected source author list";
      authorLine.append(addition);
    }
    article.append(authorLine);
    const venueParts = [paper.venue, paper.type, paper.doi ? `DOI: ${paper.doi}` : ""].filter(Boolean);
    if (venueParts.length) article.append(make("p", "bib-meta", venueParts.join(" · ")));
    fragment.append(article);
  }
  if (!visible.length) fragment.append(make("p", "empty", "No papers match the current filters."));
  $("#bibliography-list").replaceChildren(fragment);
  $("#paper-results").textContent = `${visible.length} of ${data.papers.length} works`;
}

function drawNetwork(d3, data, facultyByName, papersById, departmentColor, selectedDepartments) {
  const svg = d3.select("#network-svg");
  const width = svg.node().clientWidth < 600 ? 660 : 1000;
  const height = 660;
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  const detail = $("#network-detail-content");
  const initialDetail = detail.firstElementChild.cloneNode(true);
  const nodes = data.faculty.map((person) => ({ ...person }));
  const links = data.pairs.map((pair) => ({ ...pair }));
  const nodeRadius = (person) => Math.min(20, 5 + 1.6 * Math.sqrt(person.workCount));
  const nodeId = (value) => typeof value === "object" ? value.id : value;

  function seedConnectedComponents(groupNodes, groupLinks) {
    const byId = new Map(groupNodes.map((node) => [node.id, node]));
    const neighbors = new Map(groupNodes.map((node) => [node.id, new Set()]));
    for (const link of groupLinks) {
      const source = nodeId(link.source);
      const target = nodeId(link.target);
      if (!neighbors.has(source) || !neighbors.has(target)) continue;
      neighbors.get(source).add(target);
      neighbors.get(target).add(source);
    }
    const seen = new Set();
    const components = [];
    for (const node of groupNodes) {
      if (seen.has(node.id)) continue;
      const pending = [node.id];
      const members = [];
      seen.add(node.id);
      while (pending.length) {
        const id = pending.pop();
        members.push(byId.get(id));
        for (const neighbor of neighbors.get(id)) {
          if (seen.has(neighbor)) continue;
          seen.add(neighbor);
          pending.push(neighbor);
        }
      }
      members.sort((a, b) => neighbors.get(b.id).size - neighbors.get(a.id).size || a.id.localeCompare(b.id));
      for (const member of members) member.layoutDegree = neighbors.get(member.id).size;
      components.push({ nodes: members, side: "center" });
    }
    components.sort((a, b) => b.nodes.length - a.nodes.length || a.nodes[0].id.localeCompare(b.nodes[0].id));
    const sideGroups = { left: [], right: [] };
    const sideLoads = { left: 0, right: 0 };
    for (const component of components.slice(1)) {
      component.side = sideLoads.left <= sideLoads.right ? "left" : "right";
      sideGroups[component.side].push(component);
      sideLoads[component.side] += component.nodes.length;
    }
    for (const component of components) {
      const siblings = component.side === "center" ? [component] : sideGroups[component.side];
      const slot = siblings.indexOf(component);
      const yStep = Math.min(140, height * .65 / Math.max(1, siblings.length - 1));
      const anchorX = width / 2 + (component.side === "left" ? -width * .43 : component.side === "right" ? width * .43 : 0);
      const anchorY = height / 2 + (slot - (siblings.length - 1) / 2) * yStep;
      const departmentCounts = new Map();
      for (const node of component.nodes) {
        for (const department of node.departments) {
          departmentCounts.set(department, (departmentCounts.get(department) || 0) + 1);
        }
      }
      const departmentGroups = new Map();
      for (const node of component.nodes) {
        const department = [...node.departments].sort((a, b) =>
          departmentCounts.get(b) - departmentCounts.get(a) || a.localeCompare(b))[0];
        if (!departmentGroups.has(department)) departmentGroups.set(department, []);
        departmentGroups.get(department).push(node);
      }
      const groups = [...departmentGroups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      groups.forEach(([, members], groupIndex) => {
        const groupAngle = groupIndex * goldenAngle;
        const groupRadius = 36 * Math.sqrt(groupIndex);
        const departmentX = anchorX + groupRadius * Math.cos(groupAngle);
        const departmentY = anchorY + groupRadius * Math.sin(groupAngle);
        members.forEach((node, index) => {
          const angle = (index + 1) * goldenAngle + groupAngle;
          const radius = 16 * Math.sqrt(index);
          node.layoutX = anchorX;
          node.layoutY = anchorY;
          node.layoutSide = component.side;
          node.departmentX = departmentX;
          node.departmentY = departmentY;
          node.x = departmentX + radius * Math.cos(angle);
          node.y = departmentY + radius * Math.sin(angle);
          node.vx = 0;
          node.vy = 0;
        });
      });
    }
    return components;
  }

  function placeSideComponents(components) {
    if (components.length < 2) return;
    const bounds = (members) => ({
      left: Math.min(...members.map((node) => node.x - nodeRadius(node))),
      right: Math.max(...members.map((node) => node.x + nodeRadius(node))),
      top: Math.min(...members.map((node) => node.y - nodeRadius(node))),
      bottom: Math.max(...members.map((node) => node.y + nodeRadius(node))),
    });
    const giant = bounds(components[0].nodes);
    const giantMiddleY = (giant.top + giant.bottom) / 2;
    for (const side of ["left", "right"]) {
      const groups = components.filter((component) => component.side === side);
      const boxes = groups.map((component) => bounds(component.nodes));
      const totalHeight = boxes.reduce((sum, box) => sum + box.bottom - box.top, 0) + Math.max(0, groups.length - 1) * 24;
      let nextTop = giantMiddleY - totalHeight / 2;
      groups.forEach((component, index) => {
        const box = boxes[index];
        const dx = side === "left" ? giant.left - 24 - box.right : giant.right + 24 - box.left;
        const dy = nextTop - box.top;
        for (const node of component.nodes) {
          node.x += dx;
          node.y += dy;
          node.layoutX += dx;
          node.layoutY += dy;
          node.departmentX += dx;
          node.departmentY += dy;
        }
        nextTop += box.bottom - box.top + 24;
      });
    }
  }

  let activeComponents = seedConnectedComponents(nodes, links);
  let active = null;
  let pinned = false;
  let visibleNodes = nodes;
  let visibleLinks = links;
  let visibleNodeIds = new Set(nodes.map((node) => node.id));

  const defs = svg.append("defs");
  const jointFills = new Map();
  for (const [index, person] of nodes.filter((node) => node.departments.length > 1).entries()) {
    const id = `joint-fill-${index}`;
    const gradient = defs.append("linearGradient").attr("id", id).attr("x1", "0%").attr("x2", "100%").attr("y1", "0%").attr("y2", "0%");
    person.departments.forEach((department, position) => {
      const start = 100 * position / person.departments.length;
      const end = 100 * (position + 1) / person.departments.length;
      gradient.append("stop").attr("offset", `${start}%`).attr("stop-color", departmentColor.get(department));
      gradient.append("stop").attr("offset", `${end}%`).attr("stop-color", departmentColor.get(department));
    });
    jointFills.set(person.id, `url(#${id})`);
  }

  const viewport = svg.append("g");
  const linkLayer = viewport.append("g").attr("class", "links");
  const hitLayer = viewport.append("g").attr("class", "link-hit-areas");
  const nodeLayer = viewport.append("g").attr("class", "nodes");
  const zoom = d3.zoom().scaleExtent([0.15, 3]).on("zoom", (event) => viewport.attr("transform", event.transform));
  svg.call(zoom).on("dblclick.zoom", null);

  const visualLinks = linkLayer.selectAll("line").data(links, (link) => link.id).join("line")
    .attr("class", "graph-link")
    .attr("stroke-linecap", "round")
    .attr("stroke-width", (link) => Math.min(8, 1.2 + Math.sqrt(link.count) * 0.85));
  const hitLinks = hitLayer.selectAll("line").data(links, (link) => link.id).join("line")
    .attr("class", "graph-hit")
    .attr("stroke", "transparent")
    .attr("stroke-width", 18)
    .attr("pointer-events", "stroke")
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", (link) => `${link.source} and ${link.target}: ${link.count} coauthored works`);
  hitLinks.append("title").text((link) => `${link.source} ↔ ${link.target}: ${link.count} coauthored works`);

  const nodeGroups = nodeLayer.selectAll("g").data(nodes, (node) => node.id).join("g")
    .attr("class", "graph-node")
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", (node) => `${node.name}, ${node.departments.join(" and ")}, ${node.workCount} shared works`);
  nodeGroups.append("circle")
    .attr("r", nodeRadius)
    .attr("fill", (node) => jointFills.get(node.id) || departmentColor.get(node.departments[0]) || "#587c9c");
  nodeGroups.append("text")
    .attr("x", (node) => nodeRadius(node) + 5)
    .attr("dy", ".33em")
    .text((node) => node.name);
  nodeGroups.append("title").text((node) => `${node.name} — ${node.departments.join(" / ")}`);
  const labelWidths = new Map();
  nodeGroups.select("text").each(function (node) {
    labelWidths.set(node.id, Math.max(this.getComputedTextLength(), node.name.length * 5));
  });

  function updateLabels() {
    const centerX = visibleNodes.length
      ? (Math.min(...visibleNodes.map((node) => node.x)) + Math.max(...visibleNodes.map((node) => node.x))) / 2
      : width / 2;
    const centerY = visibleNodes.length
      ? (Math.min(...visibleNodes.map((node) => node.y)) + Math.max(...visibleNodes.map((node) => node.y))) / 2
      : height / 2;
    const forced = new Set();
    if (active?.kind === "node") {
      forced.add(active.item.id);
      for (const link of visibleLinks) {
        if (nodeId(link.source) === active.item.id) forced.add(nodeId(link.target));
        if (nodeId(link.target) === active.item.id) forced.add(nodeId(link.source));
      }
    } else if (active?.kind === "edge") {
      forced.add(nodeId(active.item.source));
      forced.add(nodeId(active.item.target));
    }
    const candidates = [...visibleNodes].sort((a, b) =>
      Number(forced.has(b.id)) - Number(forced.has(a.id))
      || b.workCount / Math.sqrt(b.name.length) - a.workCount / Math.sqrt(a.name.length)
      || a.name.localeCompare(b.name));
    const occupied = [];
    const labeled = new Set();
    const placements = new Map();
    for (const node of candidates) {
      const r = nodeRadius(node);
      const labelWidth = labelWidths.get(node.id);
      const right = { x: r + 5, y: 0, dy: ".33em", anchor: "start",
        box: { left: node.x + r + 5, right: node.x + r + 5 + labelWidth, top: node.y - 8, bottom: node.y + 8 } };
      const left = { x: -r - 5, y: 0, dy: ".33em", anchor: "end",
        box: { left: node.x - r - 5 - labelWidth, right: node.x - r - 5, top: node.y - 8, bottom: node.y + 8 } };
      const above = { x: 0, y: -r - 5, dy: "0", anchor: "middle",
        box: { left: node.x - labelWidth / 2, right: node.x + labelWidth / 2, top: node.y - r - 18, bottom: node.y - r - 3 } };
      const below = { x: 0, y: r + 16, dy: "0", anchor: "middle",
        box: { left: node.x - labelWidth / 2, right: node.x + labelWidth / 2, top: node.y + r + 3, bottom: node.y + r + 18 } };
      const options = node.x > centerX ? [left, right] : [right, left];
      options.push(...(node.y > centerY ? [above, below] : [below, above]));
      const placement = options.find(({ box }) => {
        const collidesLabel = occupied.some((other) => box.left < other.right + 3 && box.right + 3 > other.left
          && box.top < other.bottom + 2 && box.bottom + 2 > other.top);
        const collidesNode = visibleNodes.some((other) => {
          if (other.id === node.id) return false;
          const radius = nodeRadius(other) + 3;
          return box.left < other.x + radius && box.right > other.x - radius
            && box.top < other.y + radius && box.bottom > other.y - radius;
        });
        return !collidesLabel && !collidesNode;
      }) || (forced.has(node.id) ? options[0] : null);
      if (placement) {
        labeled.add(node.id);
        placements.set(node.id, placement);
        occupied.push(placement.box);
      }
    }
    nodeGroups.classed("is-labeled", (node) => labeled.has(node.id))
      .select("text")
      .attr("x", (node) => placements.get(node.id)?.x ?? nodeRadius(node) + 5)
      .attr("y", (node) => placements.get(node.id)?.y ?? 0)
      .attr("dy", (node) => placements.get(node.id)?.dy ?? ".33em")
      .attr("text-anchor", (node) => placements.get(node.id)?.anchor ?? "start");
  }

  function fitTransform() {
    if (!visibleNodes.length) return d3.zoomIdentity;
    const padding = 24;
    let minX = Math.min(...visibleNodes.map((node) => node.x - nodeRadius(node)));
    let maxX = Math.max(...visibleNodes.map((node) => node.x + nodeRadius(node)));
    let minY = Math.min(...visibleNodes.map((node) => node.y - nodeRadius(node)));
    let maxY = Math.max(...visibleNodes.map((node) => node.y + nodeRadius(node)));
    nodeGroups.each(function (node) {
      if (!visibleNodeIds.has(node.id) || !this.classList.contains("is-labeled")) return;
      const box = this.querySelector("text").getBBox();
      minX = Math.min(minX, node.x + box.x);
      maxX = Math.max(maxX, node.x + box.x + box.width);
      minY = Math.min(minY, node.y + box.y);
      maxY = Math.max(maxY, node.y + box.y + box.height);
    });
    const scale = Math.min(1, (width - padding * 2) / Math.max(1, maxX - minX),
      (height - padding * 2) / Math.max(1, maxY - minY));
    return d3.zoomIdentity
      .translate(width / 2 - scale * (minX + maxX) / 2, height / 2 - scale * (minY + maxY) / 2)
      .scale(scale);
  }

  function resetDetail() {
    detail.replaceChildren(initialDetail.cloneNode(true));
  }

  function addCloseButton() {
    const button = make("button", "quiet-button detail-close", pinned ? "Clear selection" : "Pin details");
    button.type = "button";
    button.addEventListener("click", () => {
      if (pinned) {
        pinned = false;
        activate(null);
      } else if (active) {
        pinned = true;
        activate(active);
      }
    });
    detail.append(button);
  }

  function showNode(node) {
    detail.replaceChildren();
    addCloseButton();
    detail.append(make("p", "detail-kicker", "Faculty member"), make("h3", "", node.name));
    if (node.title) detail.append(make("p", "", node.title));
    const departments = make("div");
    node.departments.forEach((name) => {
      const pill = make("span", "dept-pill", shortDepartment(name));
      pill.title = name;
      departments.append(pill);
    });
    detail.append(departments);
    const stats = make("div", "detail-stats");
    for (const [number, label] of [[node.workCount, "shared works"], [node.collaboratorCount, "FDS collaborators"]]) {
      const card = make("div");
      card.append(make("strong", "", String(number)), make("span", "", label));
      stats.append(card);
    }
    detail.append(stats);
    const top = data.pairs.filter((pair) => pair.source === node.id || pair.target === node.id).slice().sort((a, b) => b.count - a.count).slice(0, 5);
    if (top.length) {
      detail.append(make("h4", "detail-subhead", "Top FDS collaborators"));
      const list = make("ul");
      for (const pair of top) list.append(make("li", "", `${pair.source === node.id ? pair.target : pair.source} — ${pair.count} shared works`));
      detail.append(list);
    }
    for (const [label, href] of [["Official FDS profile", node.profileUrl], ["Department source", node.departmentSource]]) {
      if (!safeUrl(href)) continue;
      const link = make("a", "detail-link", label);
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      detail.append(link, make("br"));
    }
  }

  function showEdge(link) {
    detail.replaceChildren();
    addCloseButton();
    detail.append(make("p", "detail-kicker", link.withinDepartment ? "Within-department pair" : "Cross-department pair"));
    detail.append(make("h3", "", `${link.source.id} ↔ ${link.target.id}`));
    const source = facultyByName.get(link.source.id);
    const target = facultyByName.get(link.target.id);
    const departmentLine = make("p", "", `${source.departments.map(shortDepartment).join(" / ")}  ·  ${target.departments.map(shortDepartment).join(" / ")}`);
    departmentLine.title = `${source.departments.join(" / ")} · ${target.departments.join(" / ")}`;
    detail.append(departmentLine);
    const stats = make("div", "detail-stats");
    const card = make("div");
    card.append(make("strong", "", String(link.count)), make("span", "", "distinct shared works"));
    stats.append(card);
    const span = make("div");
    span.append(make("strong", "", `${link.firstYear}–${link.lastYear}`), make("span", "", "publication years"));
    stats.append(span);
    detail.append(stats, make("h4", "detail-subhead", "Papers written together"));
    const list = make("ol", "detail-paper-list");
    for (const paperId of link.paperIds) {
      const paper = papersById.get(paperId);
      if (!paper) continue;
      const item = make("li");
      appendPaperLink(item, paper, `${paper.title} (${paper.year})`);
      list.append(item);
    }
    detail.append(list);
  }

  function applyLinkStyles() {
    visualLinks
      .attr("stroke", (link) => {
        if (active?.kind === "edge" && active.item.id === link.id) return link.withinDepartment ? "#718293" : "#0c4e91";
        if (link.withinDepartment) return "#c0cad4";
        return "#557fae";
      })
      .attr("opacity", (link) => {
        if (active?.kind === "edge" && active.item.id === link.id) return 1;
        return link.withinDepartment ? .4 : .68;
      })
      .attr("stroke-width", (link) => Math.min(9, 1.2 + Math.sqrt(link.count) * .85 + (active?.kind === "edge" && active.item.id === link.id ? 2 : 0)));
  }

  function activate(selection) {
    active = selection;
    const selectedNode = selection?.kind === "node" ? selection.item.id : null;
    const selectedEdge = selection?.kind === "edge" ? selection.item.id : null;
    nodeGroups
      .classed("is-dim", (node) => {
        if (!selection) return false;
        if (selectedNode) return node.id !== selectedNode && !visibleLinks.some((link) => (nodeId(link.source) === selectedNode && nodeId(link.target) === node.id) || (nodeId(link.target) === selectedNode && nodeId(link.source) === node.id));
        return node.id !== nodeId(selection.item.source) && node.id !== nodeId(selection.item.target);
      })
      .classed("is-active", (node) => node.id === selectedNode || (selectedEdge && (node.id === nodeId(selection.item.source) || node.id === nodeId(selection.item.target))));
    visualLinks.classed("is-dim", (link) => {
      if (!selection) return false;
      if (selectedNode) return nodeId(link.source) !== selectedNode && nodeId(link.target) !== selectedNode;
      return link.id !== selectedEdge;
    });
    applyLinkStyles();
    updateLabels();
    if (!selection) resetDetail();
    else if (selection.kind === "node") showNode(selection.item);
    else showEdge(selection.item);
  }

  const hover = (kind, item) => { if (!pinned) activate({ kind, item }); };
  const leave = () => { if (!pinned) activate(null); };
  const pin = (kind, item) => { pinned = true; activate({ kind, item }); };
  const keyboardPin = (event, kind, item) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pin(kind, item);
    }
  };
  hitLinks
    .on("mouseenter", (_, link) => hover("edge", link))
    .on("mouseleave", leave)
    .on("focus", (_, link) => hover("edge", link))
    .on("blur", leave)
    .on("click", (event, link) => { event.stopPropagation(); pin("edge", link); })
    .on("keydown", (event, link) => keyboardPin(event, "edge", link));
  nodeGroups
    .on("mouseenter", (_, node) => hover("node", node))
    .on("mouseleave", leave)
    .on("focus", (_, node) => hover("node", node))
    .on("blur", leave)
    .on("click", (event, node) => { event.stopPropagation(); pin("node", node); })
    .on("keydown", (event, node) => keyboardPin(event, "node", node));
  svg.on("click", (event) => {
    const edge = event.target.closest(".graph-link");
    if (edge) {
      pin("edge", d3.select(edge).datum());
      return;
    }
    pinned = false;
    activate(null);
  });
  applyLinkStyles();

  const linkForce = d3.forceLink(links).id((node) => node.id)
      .distance((link) => link.withinDepartment ? 90 : 145)
      .strength((link) => Math.min(.34, .13 + Math.sqrt(link.count) * .025));
  let componentChargeForces = [];
  const componentCharge = (alpha) => {
    for (const force of componentChargeForces) force(alpha);
  };
  componentCharge.initialize = (_, random) => {
    componentChargeForces = activeComponents.map((component) => {
      const force = d3.forceManyBody().strength((node) => -130 - Math.min(node.workCount, 80) * 1.8);
      force.initialize(component.nodes, random);
      return force;
    });
  };
  const leafVerticalBand = (alpha) => {
    const giant = activeComponents[0];
    if (!giant || giant.nodes.length < 5) return;
    const coreY = giant.nodes.filter((node) => node.layoutDegree > 1).map((node) => node.y).sort((a, b) => a - b);
    if (coreY.length < 3) return;
    const lower = d3.quantileSorted(coreY, .1) - 95;
    const upper = d3.quantileSorted(coreY, .9) + 95;
    for (const node of giant.nodes) {
      if (node.layoutDegree !== 1) continue;
      if (node.y < lower) node.vy += (lower - node.y) * .16 * alpha;
      else if (node.y > upper) node.vy += (upper - node.y) * .16 * alpha;
    }
  };
  const simulation = d3.forceSimulation(nodes)
    .force("link", linkForce)
    .force("charge", componentCharge)
    .force("collide", d3.forceCollide().radius((node) => nodeRadius(node) + 10).iterations(2))
    .force("x", d3.forceX((node) => node.layoutX).strength((node) => node.layoutSide === "center" ? .075 : .23))
    .force("y", d3.forceY((node) => node.layoutY).strength((node) => node.layoutSide === "center" ? .11 : .1))
    .force("department-x", d3.forceX((node) => node.departmentX).strength(.025))
    .force("department-y", d3.forceY((node) => node.departmentY).strength(.025))
    .force("leaf-vertical-band", leafVerticalBand)
    .alphaDecay(.03)
    .stop();
  let tickCount = 0;
  const tick = () => {
    visualLinks
      .attr("x1", (link) => link.source.x).attr("y1", (link) => link.source.y)
      .attr("x2", (link) => link.target.x).attr("y2", (link) => link.target.y);
    hitLinks
      .attr("x1", (link) => link.source.x).attr("y1", (link) => link.source.y)
      .attr("x2", (link) => link.target.x).attr("y2", (link) => link.target.y);
    nodeGroups.attr("transform", (node) => `translate(${node.x},${node.y})`);
    if (++tickCount % 6 === 0) updateLabels();
  };
  simulation.on("tick", tick);

  function applyDepartmentSelection() {
    visibleNodes = nodes.filter((node) => node.departments.some((name) => selectedDepartments.has(name)));
    visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
    visibleLinks = links.filter((link) => visibleNodeIds.has(nodeId(link.source)) && visibleNodeIds.has(nodeId(link.target)));
    activeComponents = seedConnectedComponents(visibleNodes, visibleLinks);
    nodeGroups.attr("display", (node) => visibleNodeIds.has(node.id) ? null : "none");
    visualLinks.attr("display", (link) => visibleLinks.includes(link) ? null : "none");
    hitLinks.attr("display", (link) => visibleLinks.includes(link) ? null : "none");
    if (active && (active.kind === "node"
      ? !visibleNodeIds.has(active.item.id)
      : !visibleLinks.includes(active.item))) {
      pinned = false;
      activate(null);
    }
    simulation.nodes(visibleNodes);
    linkForce.links(visibleLinks);
    simulation.alpha(1).stop();
    for (let i = 0; i < 190; i += 1) simulation.tick();
    placeSideComponents(activeComponents);
    // forceX/forceY cache their targets; refresh them after the side components move.
    simulation.nodes(visibleNodes);
    tick();
    updateLabels();
    svg.call(zoom.transform, fitTransform());
    $("#network-visible-count").textContent = `${visibleNodes.length} faculty · ${visibleLinks.length} pairs visible`;
    $("#network-empty").hidden = visibleNodes.length > 0;
  }

  $("#reset-view").addEventListener("click", () => {
    pinned = false;
    activate(null);
    svg.call(zoom.transform, fitTransform());
  });

  nodeGroups.call(d3.drag()
    .clickDistance(5)
    .on("start", (event, node) => {
      if (!event.active) simulation.alphaTarget(.2).restart();
      node.fx = node.x;
      node.fy = node.y;
    })
    .on("drag", (event, node) => { node.fx = event.x; node.fy = event.y; })
    .on("end", (event, node) => {
      if (!event.active) simulation.alphaTarget(0);
      node.fx = null;
      node.fy = null;
    }));
  return applyDepartmentSelection;
}

start();
