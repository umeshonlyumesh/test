<h2>By Type</h2>
<apx-chart *ngIf="chartOptionsByType"
           [series]="chartOptionsByType.series"
           [chart]="chartOptionsByType.chart"
           [xaxis]="chartOptionsByType.xaxis"
           [dataLabels]="chartOptionsByType.dataLabels"
           [stroke]="chartOptionsByType.stroke"
           [title]="chartOptionsByType.title"
           [legend]="chartOptionsByType.legend">
</apx-chart>

<h2>By Entity Type</h2>
<apx-chart *ngIf="chartOptionsByEntityType"
           [series]="chartOptionsByEntityType.series"
           [chart]="chartOptionsByEntityType.chart"
           [xaxis]="chartOptionsByEntityType.xaxis"
           [dataLabels]="chartOptionsByEntityType.dataLabels"
           [stroke]="chartOptionsByEntityType.stroke"
           [title]="chartOptionsByEntityType.title"
           [legend]="chartOptionsByEntityType.legend">
</apx-chart>

<h2>By Current State</h2>
<apx-chart *ngIf="chartOptionsByCurrentState"
           [series]="chartOptionsByCurrentState.series"
           [chart]="chartOptionsByCurrentState.chart"
           [xaxis]="chartOptionsByCurrentState.xaxis"
           [dataLabels]="chartOptionsByCurrentState.dataLabels"
           [stroke]="chartOptionsByCurrentState.stroke"
           [title]="chartOptionsByCurrentState.title"
           [legend]="chartOptionsByCurrentState.legend">
</apx-chart>


  //////////////////////////////

  import { Component, OnInit } from '@angular/core';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexDataLabels,
  ApexStroke,
  ApexTitleSubtitle,
  ApexLegend
} from 'ng-apexcharts';
import * as rawData from '../../assets/simulated_event_records.json';

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  dataLabels: ApexDataLabels;
  stroke: ApexStroke;
  title: ApexTitleSubtitle;
  legend: ApexLegend;
};

@Component({
  selector: 'app-event-chart',
  templateUrl: './event-chart.component.html',
  styleUrls: ['./event-chart.component.css']
})
export class EventChartComponent implements OnInit {
  public chartOptionsByType: Partial<ChartOptions>;
  public chartOptionsByEntityType: Partial<ChartOptions>;
  public chartOptionsByCurrentState: Partial<ChartOptions>;

  constructor() {}

  ngOnInit(): void {
    const raw = (rawData as any).default;

    this.chartOptionsByType = this.buildChart(this.processData(raw, 'type'), 'Event Counts by Type');
    this.chartOptionsByEntityType = this.buildChart(this.processData(raw, 'entityType'), 'Event Counts by Entity Type');
    this.chartOptionsByCurrentState = this.buildChart(this.processData(raw, 'currentState'), 'Event Counts by Current State');
  }

  processData(data: any[], groupBy: 'type' | 'entityType' | 'currentState'): { time: string; counts: { [key: string]: number } }[] {
    const grouped: Map<string, { [key: string]: number }> = new Map();
    const intervalMinutes = 10;
    const intervalMs = intervalMinutes * 60 * 1000;

    for (const event of data) {
      const timestamp = new Date(event.event_time).getTime();
      const roundedTimestamp = Math.floor(timestamp / intervalMs) * intervalMs;
      const roundedDate = new Date(roundedTimestamp);
      const timeKey = `${roundedDate.getFullYear()}-${String(roundedDate.getMonth() + 1).padStart(2, '0')}-${String(roundedDate.getDate()).padStart(2, '0')} ${String(roundedDate.getHours()).padStart(2, '0')}:${String(roundedDate.getMinutes()).padStart(2, '0')}`;

      const key = event.meta_data?.[groupBy] ?? 'UNKNOWN';

      if (!grouped.has(timeKey)) {
        grouped.set(timeKey, {});
      }

      const counts = grouped.get(timeKey)!;
      counts[key] = (counts[key] || 0) + 1;
    }

    return Array.from(grouped.entries())
      .map(([time, counts]) => ({ time, counts }))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }

  buildChart(grouped: { time: string; counts: { [key: string]: number } }[], title: string): Partial<ChartOptions> {
    const categories = grouped.map(item => item.time);
    const keys = Array.from(new Set(grouped.flatMap(item => Object.keys(item.counts))));

    const series = keys.map(key => ({
      name: key,
      data: categories.map(time => grouped.find(g => g.time === time)?.counts[key] || 0)
    }));

    return {
      series,
      chart: {
        height: 400,
        type: 'line',
        zoom: {
          enabled: true,
          type: 'x',
          autoScaleYaxis: true
        },
        toolbar: {
          show: true,
          autoSelected: 'zoom',
          tools: {
            download: true,
            selection: true,
            zoom: true,
            zoomin: true,
            zoomout: true,
            pan: true,
            reset: true
          }
        }
      },
      dataLabels: {
        enabled: false
      },
      stroke: {
        curve: 'smooth'
      },
      title: {
        text: title,
        align: 'left'
      },
      xaxis: {
        categories
      },
      legend: {
        position: 'top'
      }
    };
  }
}
