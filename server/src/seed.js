// Sample data. 25 brands: 20 single-employee (80%) + 5 multi-employee. 37 employees incl. 4 pod leads.
const NAMES = ['Asha', 'Ravi', 'Meera', 'Kabir', 'Isha', 'Rohan', 'Neha', 'Arjun', 'Pooja', 'Vikram', 'Sneha', 'Aditya', 'Divya', 'Karan', 'Priya', 'Nikhil', 'Anjali', 'Sahil', 'Tanvi', 'Manav', 'Riya', 'Yash', 'Kavya', 'Harsh', 'Ritu', 'Varun', 'Simran', 'Dev', 'Nisha', 'Omkar', 'Swati', 'Tejas', 'Mitali', 'Gaurav', 'Pallavi', 'Sanket', 'Rhea', 'Kunal', 'Bhavna', 'Aman'];
const SINGLE = ['Zest Foods', 'Aarav Tea', 'Blue Loom', 'Cedar Candles', 'Delta Denim', 'Ember Spices', 'Fable Kids', 'Glow Skin', 'Haven Linen', 'Indigo Bags', 'Jade Jewels', 'Kiwi Snacks', 'Lotus Yoga', 'Maple Pets', 'Nova Watches', 'Olive Oils', 'Pixel Cases', 'Quartz Lamps', 'Sage Soaps', 'Tulip Toys'];

export function buildSeed() {
  const pods = [1, 2, 3, 4].map((i) => ({ id: `pod${i}`, name: `Pod ${'ABCD'[i - 1]}`, leadId: null }));
  const brands = [], processes = [], employees = [];
  let n = 0;
  const addEmp = (podId, processIds = [], extra = {}) => {
    const id = `e${String(employees.length + 1).padStart(2, '0')}`;
    employees.push({ id, name: NAMES[n++], podId, processIds, weeklyOffs: 1, ...extra });
    return id;
  };
  const addBrand = (id, name) => brands.push({ id, name });
  const addProc = (brandId, key, name, calendar, minStaff = 1) => {
    const id = `${brandId}-${key}`;
    processes.push({ id, brandId, name, calendar, minStaff });
    return id;
  };

  // 20 single-employee brands. One person runs every process of the brand.
  SINGLE.forEach((name, i) => {
    const b = `s${String(i + 1).padStart(2, '0')}`;
    addBrand(b, name);
    const ids = i === 0
      ? [addProc(b, 'cs', 'Customer Support', 'ALL_365')]               // deliberate problem: one person, 365 days
      : [addProc(b, 'cs', 'Customer Support', 'OFF_SUN_AND_HOLIDAYS'), ...(i % 3 === 0 ? [addProc(b, 'ndr', 'NDR', 'OFF_SUN_AND_HOLIDAYS')] : [])];
    addEmp(pods[i % 4].id, ids);
  });

  // 5 multi-employee brands
  addBrand('m1', 'Nimbus Apparel');
  const m1cs = addProc('m1', 'cs', 'Customer Support', 'ALL_365'), m1acc = addProc('m1', 'acc', 'Abandoned Cart', 'DAILY_EXCEPT_HOLIDAYS'), m1ndr = addProc('m1', 'ndr', 'NDR', 'OFF_SUN_AND_HOLIDAYS');
  addEmp('pod1', [m1cs]); addEmp('pod1', [m1cs, m1acc], { preferredOffDay: 6 }); addEmp('pod1', [m1acc, m1ndr]);

  addBrand('m2', 'Orchid Home');
  const m2cs = addProc('m2', 'cs', 'Customer Support', 'ALL_365', 2), m2ndr = addProc('m2', 'ndr', 'NDR', 'OFF_SUN_AND_HOLIDAYS');
  addEmp('pod2', [m2cs]); addEmp('pod2', [m2cs]); addEmp('pod2', [m2cs, m2ndr]);

  addBrand('m3', 'Pearl Beauty');
  const m3cs = addProc('m3', 'cs', 'Customer Support', 'ALL_365'), m3acc = addProc('m3', 'acc', 'Abandoned Cart', 'OFF_SUN_AND_HOLIDAYS'), m3ret = addProc('m3', 'ret', 'Retention', 'DAILY_EXCEPT_HOLIDAYS');
  addEmp('pod3', [m3cs, m3acc]); addEmp('pod3', [m3cs, m3ret], { preferredOffDay: 0 }); addEmp('pod3', [m3ret]);

  addBrand('m4', 'Quill Books');
  const m4cs = addProc('m4', 'cs', 'Customer Support', 'DAILY_EXCEPT_HOLIDAYS'), m4ndr = addProc('m4', 'ndr', 'NDR', 'OFF_SUN_AND_HOLIDAYS');
  const m5 = 'm5';
  addBrand(m5, 'Raven Gadgets');
  const m5cs = addProc(m5, 'cs', 'Customer Support', 'ALL_365'), m5acc = addProc(m5, 'acc', 'Abandoned Cart', 'DAILY_EXCEPT_HOLIDAYS');
  addEmp('pod4', [m4cs]); addEmp('pod4', [m4cs, m4ndr, m5acc]); // second one also helps Raven: cross-brand assignment
  addEmp('pod4', [m5cs, m5acc]); addEmp('pod4', [m5cs, m5acc]);

  // Pod leads: floaters with no brand, so they are natural backups
  pods.forEach((p) => { p.leadId = addEmp(p.id, [], { isPodLead: true }); });

  return {
    pods, brands, processes, employees,
    holidays: ['2026-11-08', '2026-12-25', '2027-01-01', '2027-01-26'],
    leaves: [
      { id: 'l1', employeeId: 'e21', date: '2026-12-14', type: 'L' },
      { id: 'l2', employeeId: 'e21', date: '2026-12-15', type: 'L' },
      { id: 'l3', employeeId: 'e05', date: '2026-12-10', type: 'L' }, // single-employee brand: leave creates a gap
    ],
    rosters: {},
  };
}
