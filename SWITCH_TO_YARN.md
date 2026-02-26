# Switch from npm to Yarn

## Step 1: Install Yarn

If you're using Homebrew (macOS):
```bash
brew install yarn
```

Or install globally via npm:
```bash
npm install -g yarn
```

Verify installation:
```bash
yarn --version
```

## Step 2: Remove npm lock file and node_modules

```bash
cd /Users/zavala/nfc-inventory-tracker
rm -rf node_modules
rm -f package-lock.json
```

## Step 3: Install dependencies with Yarn

```bash
yarn install
```

This will create a `yarn.lock` file instead of `package-lock.json`.

## Step 4: Update scripts (optional)

The scripts in `package.json` will work the same way, but you'll use `yarn` instead of `npm`:

- `npm start` → `yarn start`
- `npm install` → `yarn install` or just `yarn`
- `npm install <package>` → `yarn add <package>`
- `npm uninstall <package>` → `yarn remove <package>`

## Step 5: Clear caches and restart

```bash
# Clear caches
watchman watch-del-all
rm -rf .expo node_modules/.cache

# Start Metro
yarn start
# or
yarn expo start -c
```

## Note about the "server" script

The `package.json` has a script `"server": "cd server && npm start"`. If you want to use yarn there too, you can update it to:
```json
"server": "cd server && yarn start"
```

But since the server folder is currently renamed to `.server-backup`, this script won't be used anyway.

