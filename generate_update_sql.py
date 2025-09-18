import pandas as pd

# Read the Excel file
file_path = '/Users/pedromartinezsaro/Desktop/booking-webhook-system/Import Exclusive Colosseum Arena Floor and Ancient Rome guided tour dal 1 agosto 2.xlsx'
df = pd.read_excel(file_path)

# Extract booking IDs - removing prefix
df['clean_booking_id'] = df['booking_id'].str.replace('ENRO-', '').str.replace('TTG-', '').str.replace('PRO-', '').str.replace('VIA-', '').str.replace('HED-', '').str.replace('VET-', '')

# Group by booking_id to get unique bookings with their creation dates
unique_bookings = df[['clean_booking_id', 'creation_date']].drop_duplicates()

print(f"Total unique bookings to update: {len(unique_bookings)}")

# Generate SQL UPDATE statements
print("\n-- SQL to update booking creation dates from Excel file")
print("-- This will update the anomalous bookings imported in bulk\n")

# Create a single UPDATE statement using CASE
booking_ids = unique_bookings['clean_booking_id'].tolist()
print(f"-- Updating {len(booking_ids)} bookings\n")

# Split into batches of 50 for manageable updates
batch_size = 50
for i in range(0, len(unique_bookings), batch_size):
    batch = unique_bookings.iloc[i:i+batch_size]

    print(f"\n-- Batch {i//batch_size + 1}")
    print("UPDATE activity_bookings")
    print("SET created_at = CASE booking_id::text")

    for _, row in batch.iterrows():
        creation_date = pd.to_datetime(row['creation_date']).strftime('%Y-%m-%d %H:%M:%S')
        print(f"    WHEN '{row['clean_booking_id']}' THEN '{creation_date}'::timestamp")

    print("    ELSE created_at")
    print("END")
    booking_list = "', '".join(batch['clean_booking_id'].astype(str).tolist())
    print(f"WHERE booking_id::text IN ('{booking_list}');")

# Also create a verification query
print("\n\n-- Verification query to check the updates")
print("SELECT COUNT(*) as updated_count, MIN(created_at) as min_date, MAX(created_at) as max_date")
print("FROM activity_bookings")
booking_list_all = "', '".join(unique_bookings['clean_booking_id'].astype(str).tolist())
print(f"WHERE booking_id::text IN ('{booking_list_all}');")