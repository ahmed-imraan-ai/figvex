// ECharts, loaded on first use by chart.ts. Only the parts listed here are
// bundled; SERIES_TYPES in chart.ts must match the charts registered below.

import {
  BarChart,
  BoxplotChart,
  CandlestickChart,
  FunnelChart,
  GaugeChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  ParallelChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  ThemeRiverChart,
  TreeChart,
  TreemapChart,
} from "echarts/charts";
import {
  AriaComponent,
  CalendarComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  ParallelComponent,
  PolarComponent,
  RadarComponent,
  SingleAxisComponent,
  TitleComponent,
  TransformComponent,
  VisualMapComponent,
} from "echarts/components";
import { init, use, version } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

use([
  BarChart, BoxplotChart, CandlestickChart, FunnelChart, GaugeChart, GraphChart, HeatmapChart, LineChart,
  ParallelChart, PieChart, RadarChart, SankeyChart, ScatterChart, SunburstChart, ThemeRiverChart, TreeChart,
  TreemapChart,
  AriaComponent, CalendarComponent, DatasetComponent, GraphicComponent, GridComponent, LegendComponent,
  MarkAreaComponent, MarkLineComponent, MarkPointComponent, ParallelComponent, PolarComponent, RadarComponent,
  SingleAxisComponent, TitleComponent, TransformComponent, VisualMapComponent,
  SVGRenderer,
]);

export const ECHARTS_VERSION = version;

/** Draw an option to an SVG string without touching the page. */
export function renderSvg(option: Record<string, unknown>, width: number, height: number, dark: boolean): string {
  const chart = init(null, dark ? "dark" : undefined, { renderer: "svg", ssr: true, width, height });
  try {
    chart.setOption(option);
    return chart.renderToSVGString();
  } finally {
    chart.dispose();
  }
}
