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
  {
    id: "chart-stat-boxplot",
    engine: "echarts",
    category: "Charts",
    title: "Box plot from raw data",
    summary: "Marks for three groups as raw rows; the quartiles, whiskers and outliers are worked out for you.",
    code: `// stat:boxplot summarises the raw rows under ---. "group" and
// "value" name the columns. Whiskers reach the furthest point within
// 1.5 × IQR; points beyond are outliers, in a dataset of their own.
{
  "title": { "text": "Exam marks by group", "left": "center" },
  "dataset": [
    {},
    { "id": "box", "transform": { "type": "stat:boxplot", "config": { "group": "group", "value": "mark" } } }
  ],
  "tooltip": { "trigger": "item" },
  "xAxis": { "type": "category" },
  "yAxis": { "type": "value", "name": "mark", "min": 0, "max": 100 },
  "series": [
    { "name": "marks", "type": "boxplot", "datasetId": "box", "encode": { "x": "group", "y": ["low", "q1", "median", "q3", "high"] } },
    { "name": "outliers", "type": "scatter", "datasetId": "box-outliers", "encode": { "x": "group", "y": "value" } }
  ]
}
---
group,mark
A,62
A,71
A,58
A,66
A,74
A,69
A,55
A,80
A,64
A,12
B,48
B,57
B,63
B,51
B,70
B,66
B,59
B,45
B,61
B,54
C,77
C,82
C,69
C,88
C,74
C,79
C,85
C,72
C,91
C,80
`,
  },
  {
    id: "chart-stat-histogram",
    engine: "echarts",
    category: "Charts",
    title: "Histogram from raw data",
    summary: "One column of raw times, binned for you: set a bin width or a number of bins.",
    code: `// stat:histogram counts the values into bins. Set "width" or "bins";
// with neither, it uses Sturges' rule. The table it makes has the
// columns bin, count, percent, density, from and to.
{
  "title": { "text": "Time to finish the quiz", "subtext": "40 students", "left": "center" },
  "dataset": [{}, { "transform": { "type": "stat:histogram", "config": { "dimension": "minutes", "width": 5 } } }],
  "grid": { "top": 80 },
  "xAxis": { "type": "category", "name": "minutes" },
  "yAxis": { "type": "value", "name": "students" },
  "series": [{ "type": "bar", "datasetIndex": 1, "barCategoryGap": "2%", "label": { "show": true, "position": "top" } }]
}
---
minutes
12
18
21
23
24
25
26
27
27
28
29
29
30
31
31
32
32
33
33
34
34
35
35
36
36
37
38
38
39
40
41
42
43
44
46
47
49
52
55
58
`,
  },
  {
    id: "chart-stat-trend",
    engine: "echarts",
    category: "Charts",
    title: "Scatter plot with a trend line",
    summary: "Hours of revision against marks, with a least-squares line, its equation and R².",
    code: `// stat:regression fits a line to x and y. "method" can also be
// polynomial (with "order"), exponential, logarithmic or power.
// {equation} and {r2} in the series name show the fit.
{
  "title": { "text": "Revision and results", "left": "center" },
  "dataset": [{}, { "transform": { "type": "stat:regression", "config": { "x": "hours", "y": "mark", "method": "linear" } } }],
  "legend": { "bottom": 10 },
  "xAxis": { "type": "value", "name": "hours" },
  "yAxis": { "type": "value", "name": "mark", "min": 0, "max": 100 },
  "series": [
    { "name": "students", "type": "scatter", "datasetIndex": 0, "symbolSize": 9 },
    { "name": "{equation}, R² = {r2}", "type": "line", "datasetIndex": 1, "showSymbol": false, "lineStyle": { "width": 2 } }
  ]
}
---
hours,mark
2,41
3,48
4,45
5,55
6,52
7,61
8,58
9,66
10,63
11,72
12,70
14,78
15,74
16,83
18,86
`,
  },
  {
    id: "chart-stat-density",
    engine: "echarts",
    category: "Charts",
    title: "Distribution curve",
    summary: "A smooth density curve of raw heights, from a Gaussian kernel density estimate.",
    code: `// stat:density estimates the shape of the distribution. The bandwidth
// comes from Silverman's rule unless you set "bandwidth".
{
  "title": { "text": "Heights of 30 students", "left": "center" },
  "dataset": [{}, { "transform": { "type": "stat:density", "config": { "dimension": "cm" } } }],
  "xAxis": { "type": "value", "name": "cm", "min": 130, "max": 220 },
  "yAxis": { "type": "value", "name": "density" },
  "series": [{ "type": "line", "datasetIndex": 1, "showSymbol": false, "smooth": true, "areaStyle": { "opacity": 0.25 } }]
}
---
cm
152
156
158
160
161
163
164
165
166
167
168
168
169
170
171
172
173
174
175
176
177
178
179
181
182
184
186
188
191
195
`,
  },
];
