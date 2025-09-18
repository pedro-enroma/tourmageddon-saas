import pandas as pd
import json

# Read the Excel file
file_path = '/Users/pedromartinezsaro/Desktop/booking-webhook-system/Import Exclusive Colosseum Arena Floor and Ancient Rome guided tour dal 1 agosto 2.xlsx'
df = pd.read_excel(file_path)

# Show first few rows and column names
print("Column names:")
print(df.columns.tolist())
print("\nFirst 5 rows:")
print(df.head())
print(f"\nTotal rows: {len(df)}")

# Check for booking_id or activity_booking_id columns
if 'activity_booking_id' in df.columns:
    print("\nFound activity_booking_id column")
    print(f"Sample IDs: {df['activity_booking_id'].head(10).tolist()}")

if 'booking_id' in df.columns:
    print("\nFound booking_id column")
    print(f"Sample IDs: {df['booking_id'].head(10).tolist()}")

# Check for date columns
date_columns = [col for col in df.columns if 'date' in col.lower() or 'created' in col.lower()]
print(f"\nDate columns found: {date_columns}")

if date_columns:
    for col in date_columns:
        print(f"\n{col} sample values:")
        print(df[col].head())