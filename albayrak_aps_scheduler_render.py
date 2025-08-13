"""
Albayrak APS Scheduler - RENDER ONLY
This file should only be deployed on Render, not Vercel
"""
from ortools.sat.python import cp_model
from datetime import datetime, timedelta
import json

class AlbayrakAPSScheduler:
    def __init__(self):
        self.model = cp_model.CpModel()
        self.solver = cp_model.CpSolver()
        
        # Production lines
        self.lines = {
            'tel_cekme': {'name': 'Tel Çekme', 'capacity': 15000},  # kg/day
            'galvaniz': {'name': 'Galvaniz', 'capacity': 128500},   # kg/day
            'panel_cit': {'name': 'Panel Çit', 'capacity': 500},    # panels/day
            'celik_hasir': {'name': 'Çelik Hasır', 'capacity': 11000},  # kg/day
            'civi': {'name': 'Çivi', 'capacity': 5000},            # kg/day
            'tavli_tel': {'name': 'Tavlı Tel', 'capacity': 3000},   # kg/day
            'profil': {'name': 'Profil', 'capacity': 300},          # units/day
            'palet': {'name': 'Palet', 'capacity': 30}              # units/day
        }
        
        # TLC Hızlar data for wire drawing calculations
        self.tlc_hizlar_data = {
            "5x1.25": 695,
            "5x1.3": 679,
            "5x1.4": 648,
            "5x1.6": 573,
            "5x1.8": 517,
            "5x2": 471,
            "5x2.2": 432,
            "5x2.5": 387,
            "5x2.8": 352,
            "5x3": 332,
            "6x1.4": 614,
            "6x1.6": 543,
            "6x1.8": 490,
            "6x2": 446,
            "6x2.2": 409,
            "6x2.5": 367,
            "6x2.8": 333,
            "6x3": 315,
            "6x3.5": 275,
            "7x2": 426,
            "7x2.2": 391,
            "7x2.5": 350,
            "7x2.8": 318,
            "7x3": 301,
            "7x3.5": 263,
            "8x2.2": 377,
            "8x2.5": 338,
            "8x2.8": 307,
            "8x3": 290,
            "8x3.5": 254,
            "9x2.5": 329,
            "9x2.8": 299,
            "9x3": 283,
            "9x3.5": 384  # Note: This seems to be an outlier
        }
    
    def calculate_production_time(self, product_type, quantity, input_diameter=None, output_diameter=None):
        """Calculate production time based on product specifications"""
        
        if product_type == 'tel_cekme' and input_diameter and output_diameter:
            # Use TLC Hızlar formula for wire drawing
            key = f"{input_diameter}x{output_diameter}"
            if key in self.tlc_hizlar_data:
                hourly_rate = self.tlc_hizlar_data[key]
                hours_needed = quantity / hourly_rate
                return int(hours_needed * 60)  # Return in minutes
        
        # Default capacity-based calculation
        if product_type in self.lines:
            daily_capacity = self.lines[product_type]['capacity']
            daily_minutes = 24 * 60  # 24 hours in minutes
            minutes_per_unit = daily_minutes / daily_capacity
            return int(quantity * minutes_per_unit)
        
        return 60  # Default 1 hour if unknown
    
    def create_schedule(self, orders):
        """Create optimized production schedule"""
        
        # Variables
        all_tasks = []
        machine_to_tasks = {line: [] for line in self.lines.keys()}
        
        horizon = 0
        for order in orders:
            duration = self.calculate_production_time(
                order.get('routing')[0] if order.get('routing') else 'tel_cekme',
                order.get('quantity', 100),
                order.get('input_diameter'),
                order.get('output_diameter')
            )
            horizon += duration
        
        # Create tasks
        for i, order in enumerate(orders):
            routing = order.get('routing', ['tel_cekme'])
            
            for j, machine in enumerate(routing):
                if machine not in self.lines:
                    continue
                
                duration = self.calculate_production_time(
                    machine,
                    order.get('quantity', 100),
                    order.get('input_diameter'),
                    order.get('output_diameter')
                )
                
                start_var = self.model.NewIntVar(0, horizon, f'start_{i}_{j}')
                end_var = self.model.NewIntVar(0, horizon, f'end_{i}_{j}')
                interval_var = self.model.NewIntervalVar(
                    start_var, duration, end_var, f'interval_{i}_{j}'
                )
                
                task = {
                    'order_id': order.get('id', i),
                    'product': order.get('product', 'Unknown'),
                    'machine': machine,
                    'start': start_var,
                    'end': end_var,
                    'interval': interval_var,
                    'duration': duration,
                    'step': j
                }
                
                all_tasks.append(task)
                machine_to_tasks[machine].append(task)
        
        # Constraints
        # No overlap on same machine
        for machine in self.lines.keys():
            intervals = [task['interval'] for task in machine_to_tasks[machine]]
            if intervals:
                self.model.AddNoOverlap(intervals)
        
        # Precedence constraints (steps must be in order)
        for i, order in enumerate(orders):
            order_tasks = [t for t in all_tasks if t['order_id'] == order.get('id', i)]
            order_tasks.sort(key=lambda x: x['step'])
            
            for j in range(len(order_tasks) - 1):
                self.model.Add(order_tasks[j]['end'] <= order_tasks[j + 1]['start'])
        
        # Minimize makespan
        all_ends = [task['end'] for task in all_tasks]
        if all_ends:
            makespan = self.model.NewIntVar(0, horizon, 'makespan')
            self.model.AddMaxEquality(makespan, all_ends)
            self.model.Minimize(makespan)
        
        # Solve
        status = self.solver.Solve(self.model)
        
        if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
            schedule = []
            for task in all_tasks:
                schedule.append({
                    'order_id': task['order_id'],
                    'product': task['product'],
                    'machine': self.lines[task['machine']]['name'],
                    'start_time': self.solver.Value(task['start']),
                    'end_time': self.solver.Value(task['end']),
                    'duration': task['duration']
                })
            
            schedule.sort(key=lambda x: (x['start_time'], x['machine']))
            
            return {
                'status': 'optimal' if status == cp_model.OPTIMAL else 'feasible',
                'schedule': schedule,
                'makespan': self.solver.Value(makespan) if all_ends else 0,
                'solver_stats': {
                    'conflicts': self.solver.NumConflicts(),
                    'branches': self.solver.NumBranches(),
                    'wall_time': self.solver.WallTime()
                }
            }
        
        return {
            'status': 'infeasible',
            'error': 'Could not find a feasible schedule',
            'schedule': []
        }

# This should only be imported by the Render deployment
if __name__ == "__main__":
    # Test the scheduler
    scheduler = AlbayrakAPSScheduler()
    test_orders = [
        {
            'id': 1,
            'product': 'Galvanizli Tel',
            'quantity': 1000,
            'routing': ['tel_cekme', 'galvaniz'],
            'input_diameter': 5,
            'output_diameter': 2.5
        }
    ]
    result = scheduler.create_schedule(test_orders)
    print(json.dumps(result, indent=2))