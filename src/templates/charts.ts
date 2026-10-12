import type { Template } from "./index";

export const chartTemplates: Template[] = [
  {
    id: "chart-growth",
    engine: "echarts",
    category: "Charts",
    title: "Growth rates",
    summary: "Line chart comparing n, n log n and n² for n from 1 to 10.",
    code: `// Each column after the first becomes one line.
{
  "title": { "text": "How running time grows", "left": "center" },
  "legend": { "top": 40 },
  "grid": { "top": 90 },
  "xAxis": { "type": "category", "name": "n" },
  "yAxis": { "type": "value", "name": "steps" },
  "series": [
    { "type": "line", "smooth": true },
    { "type": "line", "smooth": true },
    { "type": "line", "smooth": true }
  ]
}
---
n,O(n),O(n log n),O(n²)
1,1,0,1
2,2,2,4
3,3,4.75,9
4,4,8,16
5,5,11.61,25
6,6,15.51,36
7,7,19.65,49
8,8,24,64
9,9,28.53,81
10,10,33.22,100
`,
  },
  {
    id: "chart-sorting",
    engine: "echarts",
    category: "Charts",
    title: "Sorting benchmark",
    summary: "Grouped bar chart on a log scale, with the data as CSV.",
    code: `// Illustrative timings. Replace the CSV with your own measurements.
{
  "title": { "text": "Sorting random integers", "subtext": "Time in ms, log scale", "left": "center" },
  "legend": { "top": 62 },
  "grid": { "top": 105 },
  "xAxis": { "type": "category" },
  "yAxis": { "type": "log", "name": "ms" },
  "series": [{ "type": "bar" }, { "type": "bar" }, { "type": "bar" }]
}
---
algorithm,1k items,10k items,100k items
Bubble sort,4,410,43000
Insertion sort,2,160,16500
Merge sort,0.3,3.5,42
Quicksort,0.2,2.6,31
Heapsort,0.4,4.8,61
`,
  },
  {
    id: "chart-scatter",
    engine: "echarts",
    category: "Charts",
    title: "Scatter plot",
    summary: "Study hours against exam mark, with average lines.",
    code: `{
  "title": { "text": "Study hours and exam marks", "left": "center" },
  "xAxis": { "type": "value", "name": "hours" },
  "yAxis": { "type": "value", "name": "mark", "max": 100 },
  "series": [
    {
      "type": "scatter",
      "symbolSize": 10,
      "markLine": {
        "symbol": "none",
        "lineStyle": { "type": "dashed" },
        "data": [
          { "type": "average", "valueIndex": 1, "name": "mean mark" },
          { "type": "average", "valueIndex": 0, "name": "mean hours" }
        ]
      }
    }
  ]
}
---
hours,mark
2,41
3,48
4,52
5,55
5,61
6,58
7,66
7,71
8,64
9,73
9,78
10,70
11,82
12,79
12,88
13,85
14,90
15,84
16,93
18,95
`,
  },
  {
    id: "chart-confusion",
    engine: "echarts",
    category: "Charts",
    title: "Confusion matrix",
    summary: "Heatmap of a three-class image classifier's predictions.",
    code: `// Rows are the true class, columns the predicted class.
// Each data item is [predicted, actual, count].
{
  "title": { "text": "Classifier confusion matrix", "left": "center" },
  "grid": { "top": 60, "left": 90, "bottom": 90 },
  "xAxis": { "type": "category", "name": "predicted", "nameLocation": "middle", "nameGap": 30,
             "data": ["cat", "dog", "bird"] },
  "yAxis": { "type": "category", "name": "actual", "nameLocation": "middle", "nameGap": 55,
             "data": ["bird", "dog", "cat"] },
  "visualMap": { "min": 0, "max": 50, "orient": "horizontal", "left": "center", "bottom": 10, "calculable": false },
  "series": [
    {
      "type": "heatmap",
      "label": { "show": true },
      "data": [
        [0, 2, 45], [1, 2, 4], [2, 2, 1],
        [0, 1, 6], [1, 1, 41], [2, 1, 3],
        [0, 0, 2], [1, 0, 1], [2, 0, 47]
      ]
    }
  ]
}
`,
  },
  {
    id: "chart-boxplot",
    engine: "echarts",
    category: "Charts",
    title: "Box plot",
    summary: "Exam marks for three tutorial groups as five-number summaries.",
    code: `// Each item is [minimum, lower quartile, median, upper quartile, maximum].
{
  "title": { "text": "Exam marks by tutorial group", "left": "center" },
  "xAxis": { "type": "category", "data": ["Group A", "Group B", "Group C"] },
  "yAxis": { "type": "value", "name": "mark", "min": 0, "max": 100 },
  "series": [
    {
      "type": "boxplot",
      "data": [
        [42, 58, 66, 74, 91],
        [35, 51, 63, 70, 88],
        [50, 64, 71, 80, 97]
      ]
    }
  ]
}
`,
  },
  {
    id: "chart-histogram",
    engine: "echarts",
    category: "Charts",
    title: "Histogram",
    summary: "Distribution of marks in bins of ten, drawn as touching bars.",
    code: `{
  "title": { "text": "Mark distribution", "subtext": "120 students", "left": "center" },
  "grid": { "top": 80 },
  "xAxis": { "type": "category", "name": "mark" },
  "yAxis": { "type": "value", "name": "students" },
  "series": [{ "type": "bar", "barCategoryGap": "2%", "label": { "show": true, "position": "top" } }]
}
---
bin,students
0–9,1
10–19,2
20–29,4
30–39,8
40–49,15
50–59,24
60–69,29
70–79,20
80–89,12
90–100,5
`,
  },
  {
    id: "chart-donut",
    engine: "echarts",
    category: "Charts",
    title: "Donut chart",
    summary: "Where the hours went on a group project.",
    code: `{
  "title": { "text": "Group project hours", "left": "center" },
  "legend": { "bottom": 10 },
  "series": [
    {
      "type": "pie",
      "radius": ["40%", "68%"],
      "label": { "formatter": "{b}: {c} h" },
      "data": [
        { "name": "Coding", "value": 38 },
        { "name": "Report", "value": 22 },
        { "name": "Debugging", "value": 14 },
        { "name": "Testing", "value": 14 },
        { "name": "Meetings", "value": 12 }
      ]
    }
  ]
}
`,
  },
];
