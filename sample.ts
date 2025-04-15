// event-chart.component.ts
import { Component, OnInit } from '@angular/core';
import { ChartComponent } from 'ng-apexcharts';
import {
  ApexNonAxisChartSeries,
  ApexResponsive,
  ApexChart,
  ApexTitleSubtitle,
  ApexXAxis,
  ApexYAxis,
  ApexDataLabels,
  ApexStroke,
  ApexLegend
} from 'ng-apexcharts';

export type ChartOptions = {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  responsive: ApexResponsive[];
  labels: any;
  title: ApexTitleSubtitle;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  dataLabels: ApexDataLabels;
  stroke: ApexStroke;
  legend: ApexLegend;
};

@Component({
  selector: 'app-event-chart',
  templateUrl: './event-chart.component.html',
  styleUrls: ['./event-chart.component.css']
})
export class EventChartComponent implements OnInit {
  public chartOptions: Partial<ChartOptions>;

  constructor() {
    this.chartOptions = {
      series: [],
      chart: {
        height: 350,
        type: 'line',
        zoom: {
          enabled: true
        }
      },
      dataLabels: {
        enabled: false
      },
      stroke: {
        curve: 'straight'
      },
      title: {
        text: 'Event Counts by 5-Minute Intervals',
        align: 'left'
      },
      xaxis: {
        type: 'datetime',
        labels: {
          datetimeUTC: false
        }
      },
      yaxis: {
        title: {
          text: 'Event Count'
        }
      },
      legend: {
        position: 'top',
        horizontalAlign: 'right',
        floating: true,
        offsetY: -25,
        offsetX: -5
      }
    };
  }

  ngOnInit() {
    this.processData();
  }

  processData() {
    // Sample data from the JSON file
    const data = [
      // ... (your JSON data here)
    ];

    // Group events by 5-minute intervals
    const interval = 5 * 60 * 1000; // 5 minutes in milliseconds
    const startTime = new Date('2025-04-08T12:00:00').getTime();
    const endTime = new Date('2025-04-08T14:45:00').getTime();

    // Create buckets for each 5-minute interval
    const buckets: { [key: number]: number } = {};
    for (let time = startTime; time <= endTime; time += interval) {
      buckets[time] = 0;
    }

    // Count events in each bucket
    data.forEach(event => {
      const eventTime = new Date(event.event_time).getTime();
      const bucketTime = Math.floor(eventTime / interval) * interval;
      if (buckets.hasOwnProperty(bucketTime)) {
        buckets[bucketTime]++;
      }
    });

    // Prepare data for chart
    const categories = Object.keys(buckets).map(time => parseInt(time));
    const values = Object.values(buckets);

    // Group by event type
    const stateChangeBuckets: { [key: number]: number } = {};
    const evidenceBuckets: { [key: number]: number } = {};
    for (let time = startTime; time <= endTime; time += interval) {
      stateChangeBuckets[time] = 0;
      evidenceBuckets[time] = 0;
    }

    data.forEach(event => {
      const eventTime = new Date(event.event_time).getTime();
      const bucketTime = Math.floor(eventTime / interval) * interval;
      if (event.meta_data.type === 'STATECHANGE') {
        if (stateChangeBuckets.hasOwnProperty(bucketTime)) {
          stateChangeBuckets[bucketTime]++;
        }
      } else if (event.meta_data.type === 'EVIDENCE') {
        if (evidenceBuckets.hasOwnProperty(bucketTime)) {
          evidenceBuckets[bucketTime]++;
        }
      }
    });

    const stateChangeValues = Object.values(stateChangeBuckets);
    const evidenceValues = Object.values(evidenceBuckets);

    // Update chart options
    this.chartOptions.series = [
      {
        name: 'Total Events',
        data: categories.map((time, index) => [time, values[index]])
      },
      {
        name: 'State Changes',
        data: categories.map((time, index) => [time, stateChangeValues[index]])
      },
      {
        name: 'Evidence',
        data: categories.map((time, index) => [time, evidenceValues[index]])
      }
    ];

    this.chartOptions.xaxis = {
      type: 'datetime',
      labels: {
        datetimeUTC: false,
        format: 'HH:mm'
      },
      tickAmount: 10
    };
  }
}


############################
how load the json file
// event-chart.component.ts
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  ApexNonAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexYAxis,
  ApexDataLabels,
  ApexStroke,
  ApexLegend,
  ApexTitleSubtitle,
  ApexTooltip
} from 'ng-apexcharts';

export type ChartOptions = {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  dataLabels: ApexDataLabels;
  stroke: ApexStroke;
  legend: ApexLegend;
  title: ApexTitleSubtitle;
  tooltip: ApexTooltip;
  colors: string[];
};

@Component({
  selector: 'app-event-chart',
  templateUrl: './event-chart.component.html',
  styleUrls: ['./event-chart.component.css']
})
export class EventChartComponent implements OnInit {
  public chartOptions: Partial<ChartOptions>;
  public loading = true;

  constructor(private http: HttpClient) {
    this.initializeChartOptions();
  }

  ngOnInit() {
    this.loadData();
  }

  private initializeChartOptions() {
    this.chartOptions = {
      series: [],
      chart: {
        type: 'line',
        height: 350,
        zoom: { enabled: true },
        toolbar: { show: true }
      },
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 2 },
      colors: ['#008FFB', '#00E396', '#FEB019'],
      title: {
        text: 'Event Counts by 5-Minute Intervals',
        align: 'left',
        style: { fontSize: '14px', fontWeight: 'bold' }
      },
      xaxis: {
        type: 'datetime',
        labels: { datetimeUTC: false, format: 'HH:mm' },
        tickAmount: 6
      },
      yaxis: {
        title: { text: 'Event Count' },
        min: 0,
        forceNiceScale: true
      },
      legend: { position: 'top', horizontalAlign: 'right' },
      tooltip: { enabled: true, x: { format: 'HH:mm' } }
    };
  }

  private loadData() {
    this.http.get<any[]>('/assets/generated_records.json').subscribe({
      next: (data) => {
        this.processData(data);
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading data:', err);
        this.loading = false;
      }
    });
  }

  private processData(data: any[]) {
    const roundTo5Minutes = (date: Date) => {
      const minutes = date.getMinutes();
      const roundedMinutes = Math.floor(minutes / 5) * 5;
      date.setMinutes(roundedMinutes, 0, 0);
      return date.getTime();
    };

    // Initialize time buckets
    const startTime = new Date('2025-04-08T12:00:00');
    const endTime = new Date('2025-04-08T14:45:00');
    const buckets: Record<number, { total: number; stateChange: number; evidence: number }> = {};

    // Create empty buckets
    for (let time = new Date(startTime); time <= endTime; time.setMinutes(time.getMinutes() + 5)) {
      buckets[roundTo5Minutes(new Date(time))] = { total: 0, stateChange: 0, evidence: 0 };
    }

    // Process each event
    data.forEach(event => {
      try {
        const eventTime = new Date(event.event_time);
        const bucketTime = roundTo5Minutes(eventTime);
        
        if (buckets[bucketTime]) {
          buckets[bucketTime].total++;
          
          if (event.meta_data?.type === 'STATECHANGE') {
            buckets[bucketTime].stateChange++;
          } else if (event.meta_data?.type === 'EVIDENCE') {
            buckets[bucketTime].evidence++;
          }
        }
      } catch (e) {
        console.warn('Skipping malformed event:', event);
      }
    });

    // Prepare chart data
    const timestamps = Object.keys(buckets).map(Number).sort();
    this.chartOptions.series = [
      { name: 'Total Events', data: timestamps.map(t => [t, buckets[t].total]) },
      { name: 'State Changes', data: timestamps.map(t => [t, buckets[t].stateChange]) },
      { name: 'Evidence', data: timestamps.map(t => [t, buckets[t].evidence]) }
    ];
  }
}
