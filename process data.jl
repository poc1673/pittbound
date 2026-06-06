# This is a quick data formatting script that's being used to subset the property data that I have available and then create a subset.
# Load packages here
using DataFrames
using CSV
using Dates
using Random

 
# Load the data
df = CSV.read("C://Users//peter//Dropbox//Projects//Pittsburgh Properties//Property Sales Transactions.csv", DataFrame)

# Steps:
# [1] Ensure that the SALEDATE column is in the correct date format.
# [2] Ensure that the SALEDESC field is readable.
# [3] Remove NA values from the date fields, the SALEDESC and price fields.
# [4] Print out the unique values in the SALEDESC field.

# [1]
# Convert SALEDATE to Date type (try common formats)
if !(eltype(df.SALEDATE) <: Date)
    try
        df.SALEDATE = Date.(df.SALEDATE, dateformat"mm/dd/yyyy")
    catch
        # Try another common format
        df.SALEDATE = Date.(df.SALEDATE, dateformat"yyyy-mm-dd")
    end
end

# [2]
# Make SALEDESC field readable (remove leading/trailing whitespace, unify casing)
if :SALEDESC in names(df)
    df.SALEDESC = strip.(string.(df.SALEDESC))
end

# [3]
# Remove rows where SALEDATE, SALEDESC, or price columns are missing
required_cols = [:SALEDATE, :SALEDESC, :PRICE]
existing_cols = intersect(required_cols, names(df))
filter_row(r) = all(c -> !ismissing(r[c]), existing_cols)
df = filter(filter_row, df)

# [4]
# Print unique values in SALEDESC
println("Unique SALEDESC values:")
println(unique(df.SALEDESC))


# NEXT STEPS:
#[5] Filter the data frame so that there is only "VALID SALE"
df = filter(row -> row.SALEDESC == "VALID SALE", df)

#[6] Remove all results where the SALEDATE is before September 2025.
cutoff_date = Date(2025, 9, 1)
df = filter(row -> row.SALEDATE >= cutoff_date, df)


# Get unique neighborhood names and print them
unique_neighborhoods = unique(df.MUNIDESC)
println("Unique MUNIDESCs: ", unique_neighborhoods)

# Filter the data frame so that the MUNIDESC only includes results with PITTSBURGH in them.
df = filter(row -> occursin("PITTSBURGH", row.MUNIDESC), df)

#[7] Count the number of rows in the dataframe.
println("Number of rows after filtering: ", nrow(df))

# Sample 50 results randomly from the filtered results and output as a DataFrame.
n = min(50, nrow(df))
sample_idx = randperm(nrow(df))[1:n]
sample_df = df[sample_idx, :]

CSV.write("sample data.csv", sample_df)