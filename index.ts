#!/usr/bin/env node

import { spawn }  from "child_process";
import * as yargs from "yargs";
import * as fs from "fs";


interface TypeSignature {
    signature: string;
    name: string;
};

interface Module {
    moduleName: string;
    types: TypeSignature[];
}

function isDecoder(type: TypeSignature): boolean {
    if (type.signature.indexOf("->") > -1) return false;

    return type.signature.split(" ")[0] === "Json.Decode.Decoder";
};


function onlyDecoders(module: Module): Module {
    return {
        moduleName: module.moduleName,
        types: module.types.filter(isDecoder)
    };
};

function imports(modules: Module[]) : string[] {
    return modules
    .map((module) => "import " + module.moduleName);
};

function fullDecoderName(module: Module, type: TypeSignature) : string {
    return module.moduleName + "." + type.name;
};



function elmFile (modules: Module[]) : string {
    const importLines = imports(modules.filter((module) => module.types.length > 0));
    const allDecoderNames : string[] = [];

    modules.forEach((module) => {
        module.types.forEach((type) =>{
            allDecoderNames.push(fullDecoderName(module, type));
        })
    });

    const moduleTuples = allDecoderNames.map((decoderName) => {

        return `(\"${decoderName}\", Json.Decode.map (toString) ${decoderName})`;
    });

    return  `

module DebugDecoders exposing (main)

import Html
import Html.Attributes
import Html.Events
import Dict
import Json.Decode

${importLines.join("\n")}

decodersByName : Dict.Dict String (Json.Decode.Decoder String)
decodersByName = 
    Dict.fromList 
        [ ${moduleTuples.join("\n        , ")}
        ]

type Msg
    = ChangeJson String
    | SaveChange
    | SetCurrentResult String


type alias Model =
    { json : String
    , tempJson : String
    , knownDecoders : Dict.Dict String (Json.Decode.Decoder String)
    , visibleResult : Maybe String
    }


viewHowManyRan : Model -> Int -> Html.Html Msg
viewHowManyRan model amount =
    "I ran "
        ++ (toString <| Dict.size model.knownDecoders)
        ++ " decoders!"
        ++ (toString amount) ++ " passed successfully."
        |> Html.text


runDecoder : Json.Decode.Decoder String -> String -> Result String String 
runDecoder = 
    Json.Decode.decodeString

viewSimpleResult : String -> Result String String -> Html.Html Msg
viewSimpleResult decoderName result =
    let
        color =
            case result of
                Err _ ->
                    "red"

                Ok _ ->
                    "green"
    in
        Html.div
            [ Html.Events.onClick (SetCurrentResult decoderName) ]
            [ Html.text decoderName
            , Html.div
                [ Html.Attributes.style [ ( "width", "50px" ), ( "height", "50px" ), ( "background-color", color ) ] ]
                []
            ]




viewInputJson : Model -> Html.Html Msg
viewInputJson model =
    Html.div
        []
        [ Html.textarea
            [ Html.Attributes.style [ ( "width", "500px" ), ( "height", "500px" ) ]
            , Html.Events.onInput ChangeJson
            , Html.Attributes.value model.tempJson
            ]
            []
        , Html.button [ Html.Events.onClick SaveChange ] [ Html.text "Test" ]
        ]


viewSuccessfulThing : Model -> Html.Html msg 
viewSuccessfulThing model = 
    case model.visibleResult of 
        Nothing -> Html.text ""

        Just result ->
            Html.div 
                []
                [ Html.span [ ] [ Html.text <| "The decoder known as " ++ result ++ " produced the following value: " ]
                , Html.p [ ] [ 
                    case Dict.get result model.knownDecoders of 
                        Just foundDecoder -> 
                            case runDecoder foundDecoder model.json of 
                                Ok v -> Html.text v 
                                Err e -> Html.text e

                        Nothing ->
                            Html.text ""
                    ]
                ] 
            


view : Model -> Html.Html Msg
view model =
    let
        decoderResults =
            Dict.toList model.knownDecoders
                |> List.map (\\( name, decoder ) -> (name, runDecoder decoder model.json))

        sortedBySuccess =
            decoderResults
                |> List.sortBy (\\(name, result) -> 
                    case result of 
                        Err e ->
                            1000
                        Ok _ -> 
                            0
                    )

        isOk res = 
            case res of 
                Ok _ -> True 
                _ -> False

        viewResults = 
            List.map (\\(name, result) -> viewSimpleResult name result) sortedBySuccess

        successfulRuns = 
            List.filter (\\(_, result) -> isOk result) decoderResults
                |> List.length

    in
        Html.div
            []
            [ Html.div [] (viewInputJson model :: viewHowManyRan model successfulRuns :: viewSuccessfulThing model :: [] ) 
            , Html.div [] (viewResults)
            ]


update : Msg -> Model -> ( Model, Cmd msg )
update msg model =
    case msg of
        SaveChange ->
            ( { model | json = model.tempJson }, Cmd.none )

        ChangeJson newJson ->
            ( { model | tempJson = newJson, visibleResult = Nothing }, Cmd.none )

        SetCurrentResult result ->
            ( { model | visibleResult = Just result }, Cmd.none )


main = Html.program 
    { init = ({ json = "", tempJson = "", knownDecoders = decodersByName, visibleResult = Nothing }, Cmd.none)
    , update=  update
    , view = view 
    , subscriptions = (\\_ -> Sub.none)
    }
`;
}




function main(){

    const foundArgs = yargs
        .alias("path", "p")
        .describe("path", "A path where your elm-package.json exists")
        .default("path", process.cwd())
        .usage("Provide me with a path to your elm-package.json folder. I'll find all your decoders! Then just open the file I create in elm-reactor")
        .help()
        .alias("h", "help")
        .argv;


    const path = foundArgs.path;
    let hadError = false;

    try{
        fs.readFileSync(path + "/elm-package.json");
    } catch(e){
        console.log("elm-package.json did not exist at ", path);
        console.log("Please give me the path where your elm-package.json is!");
        process.exit(1);
    }

    let stuff = spawn("elm-interface-to-json", ["--path", path]);
    let readData = "";

    stuff.on('error', (error) => {
        console.log("Error! Unable to start elm-interface-to-json");
        console.log("Make sure to install elm-interface-to-json globally first..");
        console.log("npm install -g elm-interface-to-json");
        process.exit(1);
    });

    stuff.stdout.on('data', (data) => {
        readData += data;
    });

    stuff.stderr.on('data', (data) => {
        if (!hadError) {
            console.log("Failed to load data using elm-interface-to-json correctly...");
            console.log("Did you run elm-make in the directory already? If not, do so now!");
        }

        hadError = true;
    });

    stuff.on('close', (code) => {
        if (hadError) {
            console.log("Something went wrong while running elm-interface-to-json...");
            console.log("It exited with the code:", code);
            process.exit(code);
        }
        const parsedData = JSON.parse(readData);

        const modulesWithOnlyDecoders = parsedData.map(onlyDecoders);

        console.log('Creating a file at', path + "/DebugDecoders.elm");
        fs.writeFileSync(path + "/DebugDecoders.elm", elmFile(modulesWithOnlyDecoders));
        console.log("Open it with elm-reactor!");
    });
    
};
main();