![Banner image](https://user-images.githubusercontent.com/10284570/173569848-c624317f-42b1-45a6-ab09-f0ea3c247648.png)

## Install n8n

```
npm install -g n8n
```

## Start n8n

```
n8n
```

## Create Custom Folder Under n8n Directory (for installing custom nodes)

```
cd ~/.n8n
mkdir custom
cd custom
npm init  # Create package.json with default settings
```

## Install Custom Node

1. Build the custom node code in your Custom Node Repository:

```
npm run build
```

2. Navigate to the n8n custom folder:

```
cd ~/.n8n/custom
```

3. Link your custom node:

```
npm link n8n-nodes-city-weather  # Replace with the name from your Custom Node Repository's package.json
```

4. Restart n8n to load the new node
